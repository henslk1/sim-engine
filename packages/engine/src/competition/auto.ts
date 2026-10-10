import { db } from "@sim-engine/db";
import type { Prisma } from "@sim-engine/db";
import { runCompetition } from "./run.js";

type Client = typeof db

/**
 * One slot in the open set: a venue's discipline at a tier, for a breed where
 * the discipline is breed-specific. `maxOpenAtOnce` applies per slot.
 */
function slotKey(
  venueId: string,
  disciplineDefId: string,
  tierDefId: string,
  breedId: string | null
): string {
  return `${venueId}|${disciplineDefId}|${tierDefId}|${breedId ?? ""}`
}

/**
 * Resolve the competitions that have come due, then top the open set back up.
 *
 * `now` is passed in rather than read here so the sweep judges deadlines
 * against the same instant the scheduler used to decide the sweep was due.
 */
export async function checkCompetitions(client: Client, gameId: string, now: Date) {
  // Due means: open, somebody has entered, and the deadline that entry started
  // has passed. `closesAt` is null until the first entry, so an empty
  // competition is simply never selected — it waits instead of being resolved
  // with nothing in it.
  //
  // Tutorial competitions are excluded. The tutorial creates one, enters its
  // animal and resolves it in the same breath; a sweep landing in that window
  // would resolve it first and the tutorial would find it already closed.
  const due = await client.competition.findMany({
    where: {
      gameId,
      status: "OPEN",
      closesAt: { not: null, lte: now },
      tutorialPlayerAccountId: null,
    },
    select: { id: true },
  })

  let ran = 0
  let failed = 0

  for (const c of due) {
    try {
      await runCompetition(client, { competitionId: c.id })
      ran++
    } catch (err) {
      // One competition that cannot be resolved must not stop the sweep
      // resolving the others, or topping the open set back up. It can also
      // simply mean another process got there first, which is expected now
      // that an interrupted sweep is re-run rather than lost.
      failed++
      console.error(`[competition] failed to run competition ${c.id}:`, err)
    }
  }

  const created = await replenishOpenSet(client, gameId)

  return { ran, failed, due: due.length, created }
}

/**
 * Bring every slot back up to its `maxOpenAtOnce`.
 *
 * This used to be one `count` per slot followed by one `create` per missing
 * competition — about 1,078 round trips per sweep for this game, nearly all of
 * them returning "already have one". It is now three queries to read the
 * shape of the world, a diff in memory, and a single `createMany`.
 */
async function replenishOpenSet(client: Client, gameId: string): Promise<number> {
  const venueDisciplines = await client.venueDiscipline.findMany({
    where: { venue: { gameId } },
    include: { venue: { select: { name: true } }, disciplineDef: { select: { isConformation: true } } },
  })

  if (venueDisciplines.length === 0) return 0

  const [tiers, breeds, openCounts] = await Promise.all([
    // Every tier of every discipline on offer here, in one query rather than
    // one per venue-discipline.
    client.competitionTierDef.findMany({
      where: { disciplineDefId: { in: [...new Set(venueDisciplines.map((vd) => vd.disciplineDefId))] } },
      orderBy: { tierIndex: "asc" },
    }),
    client.breed.findMany({ where: { gameId }, select: { id: true, name: true } }),
    // The one query that replaces the per-slot counts.
    client.competition.groupBy({
      by: ["venueId", "disciplineDefId", "tierDefId", "breedId"],
      where: { gameId, status: "OPEN" },
      _count: { _all: true },
    }),
  ])

  const tiersByDiscipline = new Map<string, typeof tiers>()
  for (const tier of tiers) {
    const existing = tiersByDiscipline.get(tier.disciplineDefId)
    if (existing) existing.push(tier)
    else tiersByDiscipline.set(tier.disciplineDefId, [tier])
  }

  const openBySlot = new Map<string, number>()
  for (const row of openCounts) {
    // A competition with no tier cannot belong to a slot, so it is not counted
    // against one. Nothing creates those, but the column is nullable.
    if (!row.tierDefId) continue
    openBySlot.set(
      slotKey(row.venueId, row.disciplineDefId, row.tierDefId, row.breedId),
      row._count._all
    )
  }

  const toCreate: Prisma.CompetitionCreateManyInput[] = []

  for (const vd of venueDisciplines) {
    const disciplineTiers = tiersByDiscipline.get(vd.disciplineDefId) ?? []
    // A breed-specific discipline needs one slot per breed; everything else
    // has a single slot per tier. `[null]` keeps both cases on one loop.
    const forBreeds = vd.disciplineDef.isConformation
      ? breeds
      : [null as { id: string; name: string } | null]

    for (const tier of disciplineTiers) {
      for (const breed of forBreeds) {
        const open = openBySlot.get(slotKey(vd.venueId, vd.disciplineDefId, tier.id, breed?.id ?? null)) ?? 0

        for (let i = 0; i < vd.maxOpenAtOnce - open; i++) {
          toCreate.push({
            gameId,
            venueId: vd.venueId,
            disciplineDefId: vd.disciplineDefId,
            tierDefId: tier.id,
            ...(breed && { breedId: breed.id }),
            name: breed
              ? `${vd.venue.name} — ${breed.name} ${tier.name}`
              : `${vd.venue.name} — ${tier.name}`,
            maxEntries: vd.defaultMaxEntries,
            maxWaitHours: vd.defaultMaxWaitHours,
            status: "OPEN",
            // No deadline until somebody enters. This is what stops a new
            // competition from being born already counting down towards being
            // resolved empty.
            closesAt: null,
          })
        }
      }
    }
  }

  if (toCreate.length === 0) return 0

  const { count } = await client.competition.createMany({ data: toCreate })
  return count
}
