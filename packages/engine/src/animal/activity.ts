/**
 * Which animals were interacted with, and when.
 *
 * One function decides what counts as looking after an animal. Before this,
 * the nightly inferred it from `AnimalDailyLog` — a table most interactions
 * never wrote to. Feeding, grooming, training, stage activities and entering a
 * competition all left no row, so an animal could be cared for every day of
 * its life and never age. The qualifying set was not a decision anyone had
 * made; it was a side effect of which actions happened to keep a log.
 *
 * Now it is a list, in one file, and every entry on it calls `markAnimalActive`
 * inside the same transaction as the action itself. An action that rolls back
 * takes its marker with it, so the marker cannot claim an interaction that
 * never happened.
 */

import type { Prisma } from "@sim-engine/db"

/**
 * Accepts a transaction client or the plain client. Callers should pass the
 * transaction they are already inside — that is the whole point.
 */
type ActivityClient = Prisma.TransactionClient

/**
 * What counts as an interaction, as one readable list.
 *
 * Kristin's rule, 2026-10-07: **an interaction is something the player does
 * that changes the animal's state** — mostly its health stats: energy, mood,
 * condition, care score. Not something that happens to the animal, and not
 * something the game does on its own.
 *
 * Kept as data rather than left implicit in the call sites, so that the answer
 * to "what makes my horse age?" is a thing you can read in one place.
 */
export const ANIMAL_ACTIVITY_SOURCES = {
  CARE: "a care action — feeding, grooming, anything from applyCareAction",
  LTC: "a long-term care routine performed",
  TRAINING: "a training session",
  STAGE_ACTIVITY: "a life-stage activity",
  COMPETITION_ENTRY: "entering a competition",
  CONFORMATION_INSPECTION: "a conformation inspection",
  GENETIC_TEST: "a genetic test — single locus, panel, or complete profile",
  HEALTH_TREATMENT: "starting or administering a treatment",
  BREEDING_SLOT: "posting a breeding slot on a stud listing",
  BREEDING_COVER_SENT: "sending a cover request (the sire)",
  BREEDING_COVER_CONFIRMED: "confirming a cover (the dam only)",
  BREEDING_MATERIAL_COLLECTED: "collecting genetic material from the donor",
  BREEDING_INSEMINATION: "artificial insemination (the dam)",
  BREEDING_EMBRYO_FLUSH: "flushing an embryo (the mare it is taken from)",
  BREEDING_EMBRYO_IMPLANT: "an embryo implanted (the surrogate)",
  BREEDING_BIRTH: "giving birth (the mother)",
} as const

export type AnimalActivitySource = keyof typeof ANIMAL_ACTIVITY_SOURCES

/**
 * Deliberately **not** interactions, and why.
 *
 * Written down because "this one is missing" and "this one was excluded on
 * purpose" look identical at a call site, and the difference matters: the
 * first is the bug this module exists to fix.
 */
export const NON_QUALIFYING = {
  COVER_ACCEPTED_SIRE:
    "confirming a cover marks the dam, not the sire — the stud owner took no " +
    "action, and a stranger's decision must not age somebody else's stallion",
  COVER_DECLINED:
    "declining changes nothing about either animal",
  COMPETITION_RESULT:
    "a result, including a tier advancement, is the game acting rather than " +
    "the player. Entering is the interaction and is already marked. This also " +
    "matters because the nightly and the competition sweep share the midnight " +
    "boundary and the nightly runs first, so a result landing just after it " +
    "would otherwise hand out a free age tick on a day nobody played",
  BORN_DECEASED:
    "the foal is already DECEASED, and the eligibility query only selects ALIVE",
  VET_EXAM: "deferred — diagnostic rather than a change of state",
  HEALTH_CERTIFICATE: "deferred — paperwork, not a change of state",
  OWNER_ACTIONS: "deferred — renaming, transferring and the rest change ownership, not the animal",
  EMBRYO_CREATED:
    "a vet action (Kristin, 2026-10-07), so it sits with the other deferred vet " +
    "work. It is also the one genetic-material action that touches no live " +
    "animal — it combines material already collected, and that collection is " +
    "itself marked, on the donor. Collection, flush and implant do act on an " +
    "animal and are marked despite also being vet services: the line is whether " +
    "a live animal's state changes, not who performs the procedure",
  LISTING_CREATED:
    "creating a stud listing does not touch the animal. Posting a slot does, " +
    "because it costs energy, and that is marked",
} as const

export type MarkAnimalActiveInput = {
  /**
   * Omit it and the animal's own game is looked up. Worth one extra read at a
   * call site that does not already have it in scope — a `gameId` threaded
   * through five function signatures to save a query is how the wrong game's
   * id eventually gets passed.
   */
  gameId?: string
  animalId: string
  /**
   * The age *this animal* is now. There is no global game cycle.
   *
   * Omit it and the animal's current age is read. Prefer omitting it unless
   * the cycle is already in hand from the same read that drove the action:
   * a player interaction happens on whatever cycle the animal is on at that
   * moment, and a `cycleNumber` passed down from somewhere further up is a
   * chance to pass one the animal has already left — which writes a marker
   * nothing will ever match and silently costs the player a day's aging.
   */
  cycleNumber?: number
}

/**
 * Record that an animal was interacted with during the cycle it is currently
 * on. Safe to call repeatedly: the first call of a cycle creates the row and
 * every later one moves `lastInteractionAt`.
 */
export async function markAnimalActive(
  tx: ActivityClient,
  input: MarkAnimalActiveInput,
  now: Date = new Date()
): Promise<void> {
  const { animalId } = input

  // One read covers whichever of the two was left out.
  const animal =
    input.gameId === undefined || input.cycleNumber === undefined
      ? await tx.animal.findUniqueOrThrow({
          where: { id: animalId },
          select: { gameId: true, ageInCycles: true },
        })
      : null

  const gameId = input.gameId ?? animal!.gameId
  const cycleNumber = input.cycleNumber ?? animal!.ageInCycles

  await tx.animalCycleActivity.upsert({
    where: { animalId_cycleNumber: { animalId, cycleNumber } },
    create: { gameId, animalId, cycleNumber, firstInteractionAt: now, lastInteractionAt: now },
    update: { lastInteractionAt: now },
  })
}

/**
 * Mark several animals at once, for actions involving a pair.
 *
 * Breeding is the reason this exists: a cover sent is an interaction with the
 * dam and the sire both, and doing them in two awaits inside a loop is how one
 * of them ends up forgotten.
 */
export async function markAnimalsActive(
  tx: ActivityClient,
  animals: readonly MarkAnimalActiveInput[],
  now: Date = new Date()
): Promise<void> {
  for (const animal of animals) {
    await markAnimalActive(tx, animal, now)
  }
}
