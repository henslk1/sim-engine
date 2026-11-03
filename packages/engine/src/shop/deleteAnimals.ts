import { db } from "@sim-engine/db"
import type { Prisma } from "@sim-engine/db"

/**
 * Deleting one animal touches roughly thirty tables, and the tutorial deletes
 * two at once - more than the default five seconds allows.
 */
const DELETE_TX = { timeout: 30_000, maxWait: 5_000 } as const

/**
 * Deletes an animal's own records, leaving the Animal row, AnimalAncestor and
 * AnimalBreedComposition intact for pedigree integrity. Called when burying an
 * animal or before full deletion.
 *
 * Burial deletes on purpose: this is a database that otherwise only grows, and
 * a mature game holds hundreds of thousands of animals. What it may not do is
 * damage anything a living animal depends on, which is why the pedigree rows
 * stay.
 *
 * **Competition entries and results are deliberately NOT deleted here.** They
 * are not the buried animal's records — they are the competition's, and other
 * animals' placements only mean something against the field they were won
 * against. Pruning them turned a competition of ten into a competition of one:
 * a survivor who came tenth was left as the sole visible entry, and the nine
 * animals it lost to vanished. Dead competitions are collected whole by the
 * nightly instead, once every one of their entrants is buried.
 */
/**
 * Remove everything that hangs off one animal, on a caller's transaction.
 *
 * The `Tx` form exists so this can run inside a transaction that already holds
 * the game's maintenance lock. Opening its own would release nothing and
 * protect nothing: the deletions would land on another connection, outside the
 * lock and outside the caller's rollback.
 */
export async function pruneAnimalDataTx(tx: Prisma.TransactionClient, animalId: string): Promise<void> {
  const where = { animalId }

  await tx.animalStat.deleteMany({ where })
  await tx.animalStatHistory.deleteMany({ where })
  await tx.animalEnergy.deleteMany({ where })
  await tx.animalMood.deleteMany({ where })
  await tx.animalCondition.deleteMany({ where })
  await tx.animalImmunity.deleteMany({ where })
  await tx.animalCareScore.deleteMany({ where })
  await tx.animalPersonality.deleteMany({ where })
  await tx.animalLongTermCareRecord.deleteMany({ where })
  await tx.animalBehaviorEvent.deleteMany({ where })
  await tx.animalDailyLog.deleteMany({ where })
  await tx.animalGenotype.deleteMany({ where })
  await tx.animalConformationScore.deleteMany({ where })
  await tx.animalConformationSectionScore.deleteMany({ where })
  await tx.animalTreatmentRecord.deleteMany({ where })
  await tx.animalHealthRecord.deleteMany({ where })
  await tx.activityRestriction.deleteMany({ where })
  await tx.careLog.deleteMany({ where })
  await tx.stageActivityLog.deleteMany({ where })
  await tx.animalCompetitionTier.deleteMany({ where })
  await tx.animalWeeklyPoints.deleteMany({ where })
  await tx.animalBrand.deleteMany({ where })
  await tx.animalTitle.deleteMany({ where })
  await tx.animalEquipment.deleteMany({ where })
  await tx.healthCertificate.deleteMany({ where })
  await tx.vetVisitLog.deleteMany({ where })
  await tx.animalTestResult.deleteMany({ where })
  await tx.trainingLog.deleteMany({ where })
  await tx.clinicEntry.deleteMany({ where })
  await tx.animalAppliedItem.deleteMany({ where })
}

/** The same work, for a caller with no transaction of its own. */
export async function pruneAnimalData(animalId: string): Promise<void> {
  await db.$transaction((tx) => pruneAnimalDataTx(tx, animalId))
}

/**
 * Fully removes animals and all related records.
 * Intended for shop animal cleanup where no pedigree needs to be preserved.
 *
 * Breeding history (pregnancies, breeding records, cover offers, stud listings)
 * has its own RESTRICT foreign keys back to Animal and must be cleared before
 * the animal rows themselves — an animal that ever bred, was bred to, or held
 * a stud listing would otherwise silently fail to delete.
 */
/**
 * Delete animals and everything that references them, on a caller's
 * transaction.
 *
 * Tutorial completion runs this against the simulation-only ancestors. It has
 * to be the *same* transaction that deleted the pairing naming them: on another
 * connection it blocks on that uncommitted delete until the transaction times
 * out, and after the commit it runs with the game's lock already released, so a
 * nightly can start underneath it.
 */
export async function deleteAnimalsWithChildrenTx(
  tx: Prisma.TransactionClient,
  animalIds: string[]
): Promise<void> {
  if (animalIds.length === 0) return

  for (const animalId of animalIds) {
    await pruneAnimalDataTx(tx, animalId)
  }

  const ids = animalIds

  // Competition history survives burial, but not a full delete: the Animal row
  // itself is going, and `CompetitionEntry.animalId` is a RESTRICT foreign key
  // back to it. `CompetitionResult.entryId` is RESTRICT onto the entry, so it
  // has to go first. (`CompetitionEntryStat` cascades off the entry.)
  await tx.competitionResult.deleteMany({ where: { entry: { animalId: { in: ids } } } })
  await tx.competitionEntry.deleteMany({ where: { animalId: { in: ids } } })

  const pregnancies = await tx.pregnancy.findMany({ where: { animalId: { in: ids } }, select: { id: true } })
  const pregnancyIds = pregnancies.map(p => p.id)
  if (pregnancyIds.length > 0) {
    await tx.pregnancyOffspring.deleteMany({ where: { pregnancyId: { in: pregnancyIds } } })
    await tx.surrogacyRecord.deleteMany({ where: { pregnancyId: { in: pregnancyIds } } })
    await tx.pregnancy.deleteMany({ where: { id: { in: pregnancyIds } } })
  }
  await tx.breedingRecord.deleteMany({ where: { OR: [{ sireId: { in: ids } }, { damId: { in: ids } }] } })
  await tx.coverOffer.deleteMany({ where: { OR: [{ sireId: { in: ids } }, { damId: { in: ids } }] } })

  const listings = await tx.breedingListing.findMany({ where: { animalId: { in: ids } }, select: { id: true } })
  const listingIds = listings.map(l => l.id)
  if (listingIds.length > 0) {
    await tx.breedingSlot.deleteMany({ where: { listingId: { in: listingIds } } })
    await tx.breedingListingBreedRestriction.deleteMany({ where: { listingId: { in: listingIds } } })
    await tx.breedingListingStatMinimum.deleteMany({ where: { listingId: { in: listingIds } } })
    await tx.breedingListing.deleteMany({ where: { id: { in: listingIds } } })
  }

  await tx.animalDailyLog.deleteMany({ where: { partnerAnimalId: { in: ids } } })
  await tx.animalAncestor.deleteMany({ where: { animalId: { in: ids } } })
  await tx.animalAncestor.deleteMany({ where: { ancestorId: { in: ids } } })
  await tx.animalBreedComposition.deleteMany({ where: { animalId: { in: ids } } })
  await tx.animal.deleteMany({ where: { id: { in: ids } } })
}

/** The same work, for a caller with no transaction of its own. */
export async function deleteAnimalsWithChildren(animalIds: string[]): Promise<void> {
  if (animalIds.length === 0) return
  await db.$transaction((tx) => deleteAnimalsWithChildrenTx(tx, animalIds), DELETE_TX)
}
