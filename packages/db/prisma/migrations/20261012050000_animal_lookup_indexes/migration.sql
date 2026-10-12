-- Eight foreign-key columns the nightly filters on that had no index behind them.
--
-- None of this was visible until the database had sick, treated, pregnant and
-- dead animals in it: every query below sits on a branch that only runs when
-- one of those exists. Measured on a seeded copy, aging a heavy animal read
-- 5,699 rows and burying one took 30ms; with these, 491 rows and 16ms, and a
-- burial costs the same whatever history the animal accumulated.
--
-- `AnimalTreatmentRecord.healthRecordId` is the one that matters most. It is a
-- RESTRICT reference with no index on the referencing side, so Postgres scans
-- the whole table both when aging closes a course and, once per health record,
-- when burial deletes them — 67 sequential scans per buried animal.

-- CreateIndex
CREATE INDEX "ActivityRestriction_animalId_idx" ON "ActivityRestriction"("animalId");

-- CreateIndex
CREATE INDEX "ActivityRestriction_pregnancyId_isActive_idx" ON "ActivityRestriction"("pregnancyId", "isActive");

-- CreateIndex
CREATE INDEX "AnimalAppliedItem_animalId_idx" ON "AnimalAppliedItem"("animalId");

-- CreateIndex
CREATE INDEX "AnimalBehaviorEvent_animalId_idx" ON "AnimalBehaviorEvent"("animalId");

-- CreateIndex
CREATE INDEX "AnimalTestResult_animalId_idx" ON "AnimalTestResult"("animalId");

-- CreateIndex
CREATE INDEX "AnimalTreatmentRecord_healthRecordId_isActive_idx" ON "AnimalTreatmentRecord"("healthRecordId", "isActive");

-- CreateIndex
CREATE INDEX "ClinicEntry_animalId_idx" ON "ClinicEntry"("animalId");

-- CreateIndex
CREATE INDEX "VetVisitLog_animalId_idx" ON "VetVisitLog"("animalId");
