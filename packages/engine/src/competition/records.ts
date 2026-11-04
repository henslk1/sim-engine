/**
 * Who holds which record, who may set one, and when they become eligible.
 *
 * `RecordDef` narrows on two nullable columns, so one stat has four possible
 * records in a game: the best overall, the best within a breed, the best within
 * a discipline, and the best within both. Every lookup used to match on the
 * game and the stat alone and take whatever came back first, which meant a
 * Thoroughbred could take the Arabian record while the global row - the one
 * competition scoring normalises against - went untouched.
 *
 * The two narrowings are not the same kind of thing, and that is the whole of
 * this module:
 *
 *   - **A breed is not a choice.** A horse is eligible for its breed's record
 *     from birth, and training maintains it.
 *   - **A discipline is participation.** A horse is eligible for a discipline's
 *     record once it has actually competed in that discipline - not when
 *     somebody assigns it one. Assignment is free and reversible;
 *     `AnimalCompetitionTier` is written the moment a discipline is set, so it
 *     says nothing either. An entry is the only honest marker.
 *
 * Which leaves the problem that makes participation workable at all: training
 * is what writes records, and a horse that trains to its cap and only then
 * enters its first competition would never train again to trigger the write.
 * So entry seeds the discipline's records from where the horse already stands,
 * and training maintains them from there.
 */

import type { Prisma } from "@sim-engine/db"

type Tx = Prisma.TransactionClient

/**
 * The game-wide record for one trained stat.
 *
 * Null on both narrowing columns is what makes it the global one, and this is
 * the row competition scoring normalises against: a divisor that changed with
 * the entrant would measure two horses in one field differently.
 */
export function globalStatRecordWhere(
  gameId: string,
  statDefId: string
): { gameId: string; statDefId: string; breedId: null; disciplineDefId: null } {
  return { gameId, statDefId, breedId: null, disciplineDefId: null }
}

/**
 * Whether one definition is one this animal may set.
 *
 * A definition applies when every narrowing it makes is one the animal
 * satisfies, and `globalStatRecordWhere` above is the case where it makes none.
 * `disciplineDefIds` is the set the animal has *competed in*, which is a
 * different question from the set it is assigned - see the file comment.
 */
export function statRecordAppliesTo(
  def: { breedId: string | null; disciplineDefId: string | null },
  animal: { breedId: string | null; disciplineDefIds: readonly string[] }
): boolean {
  if (def.breedId !== null && def.breedId !== animal.breedId) return false
  if (def.disciplineDefId !== null && !animal.disciplineDefIds.includes(def.disciplineDefId)) {
    return false
  }
  return true
}

/**
 * Which of these disciplines the animal has actually entered a competition in.
 *
 * Asked of the competitions rather than the entries, and distinct, so the
 * answer is at most one row per discipline asked about however long a career
 * the horse has had.
 */
export async function disciplinesEnteredBy(
  tx: Tx,
  animalId: string,
  disciplineDefIds: readonly string[]
): Promise<string[]> {
  if (disciplineDefIds.length === 0) return []

  const competitions = await tx.competition.findMany({
    where: { disciplineDefId: { in: [...disciplineDefIds] }, entries: { some: { animalId } } },
    select: { disciplineDefId: true },
    distinct: ["disciplineDefId"],
  })
  return competitions.map((c) => c.disciplineDefId)
}

/**
 * Put one value against one definition, if it beats what that animal already
 * has there.
 *
 * A record is a high-water mark per animal; the record itself is the best of
 * them, which is what `worldMaxFor` reads.
 */
async function setStatRecord(tx: Tx, recordDefId: string, animalId: string, value: number) {
  const existing = await tx.recordEntry.findFirst({
    where: { recordDefId, animalId },
    select: { id: true, value: true },
  })

  if (!existing) {
    await tx.recordEntry.create({ data: { recordDefId, animalId, value } })
    return
  }
  if (value > existing.value) {
    await tx.recordEntry.update({
      where: { id: existing.id },
      data: { value, setAt: new Date() },
    })
  }
}

/**
 * Record a stat the animal has just trained, against every definition it is
 * eligible for.
 *
 * Training is the only thing that moves a record between competitions, so this
 * is where the overall and breed records are kept up. Discipline records are
 * kept up here too, but only for disciplines the horse has already entered -
 * `seedDisciplineStatRecords` is what brings one into reach.
 */
export async function maintainStatRecords(
  tx: Tx,
  input: {
    gameId: string
    animalId: string
    breedId: string | null
    statDefId: string
    value: number
  }
): Promise<void> {
  const { gameId, animalId, breedId, statDefId, value } = input

  const defs = await tx.recordDef.findMany({
    where: { gameId, statDefId },
    select: { id: true, breedId: true, disciplineDefId: true },
  })
  if (defs.length === 0) return

  // The participation query is skipped entirely when no definition asks for it,
  // which is every game that has configured no discipline records.
  const narrowed = [...new Set(defs.map((d) => d.disciplineDefId).filter((id) => id !== null))]
  const disciplineDefIds = await disciplinesEnteredBy(tx, animalId, narrowed)

  for (const def of defs) {
    if (!statRecordAppliesTo(def, { breedId, disciplineDefIds })) continue
    await setStatRecord(tx, def.id, animalId, value)
  }
}

/**
 * Open this discipline's records to the animal entering it, and fill them from
 * where it already stands.
 *
 * Called as an entry is accepted, which is the moment the horse becomes a
 * competitor in that discipline. Without it, participation-based eligibility
 * would have a hole: training is what writes records, so a horse that trained
 * to its cap before its first competition could never trigger the write
 * afterwards - it has nothing left to train.
 *
 * Run on every entry rather than only the first. The write is a high-water
 * mark, so repeating it costs a comparison and changes nothing, and a horse
 * whose first entry predates any of this is picked up by its next one.
 */
export async function seedDisciplineStatRecords(
  tx: Tx,
  input: {
    gameId: string
    animalId: string
    breedId: string | null
    disciplineDefId: string
  }
): Promise<void> {
  const { gameId, animalId, breedId, disciplineDefId } = input

  const defs = await tx.recordDef.findMany({
    where: { gameId, disciplineDefId },
    select: { id: true, statDefId: true, breedId: true, disciplineDefId: true },
  })

  // A definition with no stat is a record of something else entirely, and this
  // client will not take `not: null` on a nullable scalar in the query itself.
  const applicable = defs.filter(
    (def) =>
      def.statDefId !== null &&
      statRecordAppliesTo(def, { breedId, disciplineDefIds: [disciplineDefId] })
  )
  if (applicable.length === 0) return

  const stats = await tx.animalStat.findMany({
    where: { animalId, statDefId: { in: applicable.map((d) => d.statDefId!) } },
    select: { statDefId: true, trainedValue: true },
  })
  const trained = new Map(stats.map((s) => [s.statDefId, s.trainedValue]))

  for (const def of applicable) {
    const value = trained.get(def.statDefId!)
    if (value === undefined) continue
    await setStatRecord(tx, def.id, animalId, value)
  }
}
