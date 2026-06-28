-- CreateEnum
CREATE TYPE "TreatmentType" AS ENUM ('OTC', 'PRESCRIPTION', 'VET_PROCEDURE', 'ACTIVITY_RESTRICTION', 'PLAYER_ACTION');

-- CreateEnum
CREATE TYPE "ActivityRestrictionType" AS ENUM ('TRAINING', 'COMPETITION', 'BREEDING', 'CARE_ACTION', 'ALL');

-- CreateTable
CREATE TABLE "HealthConditionDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isGenetic" BOOLEAN NOT NULL DEFAULT false,
    "isFatal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HealthConditionDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthConditionBehavior" (
    "id" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,
    "careActionDefId" TEXT,
    "symptomText" TEXT NOT NULL,

    CONSTRAINT "HealthConditionBehavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentDef" (
    "id" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "treatmentType" "TreatmentType" NOT NULL,
    "durationCycles" INTEGER,

    CONSTRAINT "TreatmentDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentItem" (
    "id" TEXT NOT NULL,
    "treatmentDefId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TreatmentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalHealthRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,
    "diagnosedCycle" INTEGER NOT NULL,
    "diagnosedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedCycle" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AnimalHealthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTreatmentRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "treatmentDefId" TEXT NOT NULL,
    "healthRecordId" TEXT NOT NULL,
    "startedCycle" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedCycle" INTEGER,
    "completedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AnimalTreatmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityRestriction" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "treatmentRecordId" TEXT,
    "restrictionType" "ActivityRestrictionType" NOT NULL,
    "maxIntensityTier" INTEGER,
    "remainingCycles" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ActivityRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTestResult" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "testedCycle" INTEGER NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalTestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCertificateDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "validForCycles" INTEGER NOT NULL,
    "requiredForCompetition" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "HealthCertificateDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthCertificate" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "certDefId" TEXT NOT NULL,
    "issuedCycle" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAtCycle" INTEGER NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "HealthCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VetVisitLog" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "visitCycle" INTEGER NOT NULL,
    "notes" TEXT,
    "visitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VetVisitLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalImmunity" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalImmunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthConditionDef_gameId_name_key" ON "HealthConditionDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentItem_treatmentDefId_itemDefId_key" ON "TreatmentItem"("treatmentDefId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTestResult_animalId_conditionDefId_key" ON "AnimalTestResult"("animalId", "conditionDefId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCertificateDef_gameId_name_key" ON "HealthCertificateDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCertificate_animalId_certDefId_key" ON "HealthCertificate"("animalId", "certDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalImmunity_animalId_key" ON "AnimalImmunity"("animalId");

-- AddForeignKey
ALTER TABLE "HealthConditionDef" ADD CONSTRAINT "HealthConditionDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthConditionBehavior" ADD CONSTRAINT "HealthConditionBehavior_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthConditionBehavior" ADD CONSTRAINT "HealthConditionBehavior_careActionDefId_fkey" FOREIGN KEY ("careActionDefId") REFERENCES "CareActionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentDef" ADD CONSTRAINT "TreatmentDef_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_treatmentDefId_fkey" FOREIGN KEY ("treatmentDefId") REFERENCES "TreatmentDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalHealthRecord" ADD CONSTRAINT "AnimalHealthRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalHealthRecord" ADD CONSTRAINT "AnimalHealthRecord_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTreatmentRecord" ADD CONSTRAINT "AnimalTreatmentRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTreatmentRecord" ADD CONSTRAINT "AnimalTreatmentRecord_treatmentDefId_fkey" FOREIGN KEY ("treatmentDefId") REFERENCES "TreatmentDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTreatmentRecord" ADD CONSTRAINT "AnimalTreatmentRecord_healthRecordId_fkey" FOREIGN KEY ("healthRecordId") REFERENCES "AnimalHealthRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRestriction" ADD CONSTRAINT "ActivityRestriction_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityRestriction" ADD CONSTRAINT "ActivityRestriction_treatmentRecordId_fkey" FOREIGN KEY ("treatmentRecordId") REFERENCES "AnimalTreatmentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTestResult" ADD CONSTRAINT "AnimalTestResult_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTestResult" ADD CONSTRAINT "AnimalTestResult_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCertificateDef" ADD CONSTRAINT "HealthCertificateDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCertificate" ADD CONSTRAINT "HealthCertificate_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthCertificate" ADD CONSTRAINT "HealthCertificate_certDefId_fkey" FOREIGN KEY ("certDefId") REFERENCES "HealthCertificateDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetVisitLog" ADD CONSTRAINT "VetVisitLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetVisitLog" ADD CONSTRAINT "VetVisitLog_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalImmunity" ADD CONSTRAINT "AnimalImmunity_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
