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
    db.animalHealthRecord.deleteMany({ where }),
    db.animalTreatmentRecord.deleteMany({ where }),
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
    db.competitionEntry.deleteMany({ where }),
  ])
}

/**
 * Fully removes animals and all related records.
 * Intended for shop animal cleanup where no pedigree needs to be preserved.
 */
export async function deleteAnimalsWithChildren(animalIds: string[]): Promise<void> {
  if (animalIds.length === 0) return

  for (const animalId of animalIds) {
    await pruneAnimalData(animalId)
  }

  const ids = animalIds
  await db.animalDailyLog.deleteMany({ where: { partnerAnimalId: { in: ids } } })
  await db.animalAncestor.deleteMany({ where: { animalId: { in: ids } } })
  await db.animalAncestor.deleteMany({ where: { ancestorId: { in: ids } } })
  await db.animalBreedComposition.deleteMany({ where: { animalId: { in: ids } } })
  await db.animal.deleteMany({ where: { id: { in: ids } } })
}
