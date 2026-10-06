-- Indexes for the queries the nightly update runs once per animal.
--
-- Every one of these tables was reachable only by sequential scan: the schema
-- had 7 secondary indexes across 239 models. That is survivable while a query
-- runs once, and is not once it runs once per animal per night.
--
-- Scoped deliberately to the nightly's own hot path. The competition sweep and
-- the stable/animal list pages want indexes of their own, added alongside the
-- work that needs them rather than speculatively here.

-- Nightly: the living, non-shop population of a game, and the auto-bury sweep.
CREATE INDEX "Animal_gameId_status_idx" ON "Animal"("gameId", "status");

-- Nightly: which animals were interacted with during their current cycle.
CREATE INDEX "AnimalDailyLog_animalId_cycleNumber_idx" ON "AnimalDailyLog"("animalId", "cycleNumber");

-- Aging: the animal's health history, fatal-condition checks, active conditions.
CREATE INDEX "AnimalHealthRecord_animalId_isActive_idx" ON "AnimalHealthRecord"("animalId", "isActive");

-- Aging: active treatment courses to advance.
CREATE INDEX "AnimalTreatmentRecord_animalId_isActive_idx" ON "AnimalTreatmentRecord"("animalId", "isActive");

-- Aging: restrictions carried by a treatment, loaded with it and cleared with it.
CREATE INDEX "ActivityRestriction_treatmentRecordId_isActive_idx" ON "ActivityRestriction"("treatmentRecordId", "isActive");

-- Aging: the animal's open pregnancy, advanced one cycle.
CREATE INDEX "Pregnancy_animalId_isCompleted_idx" ON "Pregnancy"("animalId", "isCompleted");

-- Aging: did this animal work, train, compete or get cared for this cycle —
-- four counts per animal, one table each.
CREATE INDEX "CareLog_animalId_cycleNumber_idx" ON "CareLog"("animalId", "cycleNumber");
CREATE INDEX "TrainingLog_animalId_cycleNumber_idx" ON "TrainingLog"("animalId", "cycleNumber");
CREATE INDEX "StageActivityLog_animalId_cycleNumber_idx" ON "StageActivityLog"("animalId", "cycleNumber");
CREATE INDEX "CompetitionEntry_animalId_cycleNumber_idx" ON "CompetitionEntry"("animalId", "cycleNumber");
