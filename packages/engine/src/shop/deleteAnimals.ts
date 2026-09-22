import { db } from "@sim-engine/db"

/**
 * Deletes all non-essential records for an animal, leaving the Animal row,
 * AnimalAncestor, and AnimalBreedComposition intact for pedigree integrity.
 * Called when burying an animal or before full deletion.
 */
export async function pruneAnimalData(animalId: string): Promise<void> {
  const where = { animalId }

  await db.$transaction([
    db.animalStat.deleteMany({ where }),
    db.animalStatHistory.deleteMany({ where }),
    db.animalEnergy.deleteMany({ where }),
    db.animalMood.deleteMany({ where }),
    db.animalCondition.deleteMany({ where }),
    db.animalImmunity.deleteMany({ where }),
    db.animalCareScore.deleteMany({ where }),
    db.animalPersonality.deleteMany({ where }),
    db.animalLongTermCareRecord.deleteMany({ where }),
    db.animalBehaviorEvent.deleteMany({ where }),
    db.animalDailyLog.deleteMany({ where }),
    db.animalGenotype.deleteMany({ where }),
    db.animalConformationScore.deleteMany({ where }),
    db.animalConformationSectionScore.deleteMany({ where }),
    // AnimalTreatmentRecord.healthRecordId is a RESTRICT FK to AnimalHealthRecord —
    // must go first, or deleting a health record with any treatment history fails.
    db.animalTreatmentRecord.deleteMany({ where }),
    db.animalHealthRecord.deleteMany({ where }),
    db.activityRestriction.deleteMany({ where }),
    db.careLog.deleteMany({ where }),
    db.stageActivityLog.deleteMany({ where }),
    db.animalCompetitionTier.deleteMany({ where }),
    db.animalWeeklyPoints.deleteMany({ where }),
    db.animalBrand.deleteMany({ where }),
    db.animalTitle.deleteMany({ where }),
    db.animalEquipment.deleteMany({ where }),
    db.healthCertificate.deleteMany({ where }),
    db.vetVisitLog.deleteMany({ where }),
    db.animalTestResult.deleteMany({ where }),
    db.trainingLog.deleteMany({ where }),
    db.clinicEntry.deleteMany({ where }),
    // CompetitionResult.entryId is a RESTRICT FK to CompetitionEntry — must go first.
    db.competitionResult.deleteMany({ where: { entry: where } }),
    db.competitionEntry.deleteMany({ where }),
    db.animalAppliedItem.deleteMany({ where }),
  ])
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
export async function deleteAnimalsWithChildren(animalIds: string[]): Promise<void> {
  if (animalIds.length === 0) return

  for (const animalId of animalIds) {
    await pruneAnimalData(animalId)
  }

  const ids = animalIds

  const pregnancies = await db.pregnancy.findMany({ where: { animalId: { in: ids } }, select: { id: true } })
  const pregnancyIds = pregnancies.map(p => p.id)
  if (pregnancyIds.length > 0) {
    await db.pregnancyOffspring.deleteMany({ where: { pregnancyId: { in: pregnancyIds } } })
    await db.surrogacyRecord.deleteMany({ where: { pregnancyId: { in: pregnancyIds } } })
    await db.pregnancy.deleteMany({ where: { id: { in: pregnancyIds } } })
  }
  await db.breedingRecord.deleteMany({ where: { OR: [{ sireId: { in: ids } }, { damId: { in: ids } }] } })
  await db.coverOffer.deleteMany({ where: { OR: [{ sireId: { in: ids } }, { damId: { in: ids } }] } })

  const listings = await db.breedingListing.findMany({ where: { animalId: { in: ids } }, select: { id: true } })
  const listingIds = listings.map(l => l.id)
  if (listingIds.length > 0) {
    await db.breedingSlot.deleteMany({ where: { listingId: { in: listingIds } } })
    await db.breedingListingBreedRestriction.deleteMany({ where: { listingId: { in: listingIds } } })
    await db.breedingListingStatMinimum.deleteMany({ where: { listingId: { in: listingIds } } })
    await db.breedingListing.deleteMany({ where: { id: { in: listingIds } } })
  }

  await db.animalDailyLog.deleteMany({ where: { partnerAnimalId: { in: ids } } })
  await db.animalAncestor.deleteMany({ where: { animalId: { in: ids } } })
  await db.animalAncestor.deleteMany({ where: { ancestorId: { in: ids } } })
  await db.animalBreedComposition.deleteMany({ where: { animalId: { in: ids } } })
  await db.animal.deleteMany({ where: { id: { in: ids } } })
}
