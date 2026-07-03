-- CreateEnum
CREATE TYPE "ClinicHostType" AS ENUM ('PLAYER', 'GROUP');

-- CreateTable
CREATE TABLE "TrainingActionDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "baseGain" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TrainingActionDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntensityTierDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tierIndex" INTEGER NOT NULL,
    "energyCost" DOUBLE PRECISION NOT NULL,
    "gainMultiplier" DOUBLE PRECISION NOT NULL,
    "minMood" DOUBLE PRECISION,
    "minCondition" DOUBLE PRECISION,

    CONSTRAINT "IntensityTierDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingLog" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "trainingActionDefId" TEXT NOT NULL,
    "intensityTierDefId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "statGained" DOUBLE PRECISION NOT NULL,
    "energyUsed" DOUBLE PRECISION NOT NULL,
    "performedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalEnergy" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "currentEnergy" DOUBLE PRECISION NOT NULL,
    "maxEnergy" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalEnergy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalCondition" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalMood" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalMood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalPersonality" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "traitLabel" TEXT,

    CONSTRAINT "AnimalPersonality_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageActivityDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "lifeStageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "personalityEffect" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "energyCost" DOUBLE PRECISION,

    CONSTRAINT "StageActivityDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageActivityLog" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "stageActivityDefId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "performedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clinic" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "hostType" "ClinicHostType" NOT NULL,
    "hostPlayerId" TEXT,
    "hostGroupId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "maxEntries" INTEGER,

    CONSTRAINT "Clinic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicEntry" (
    "id" TEXT NOT NULL,
    "clinicId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiredTrainer" (
    "id" TEXT NOT NULL,
    "jobContractId" TEXT NOT NULL,
    "trainerPlayerId" TEXT NOT NULL,
    "hiredByPlayerId" TEXT NOT NULL,

    CONSTRAINT "HiredTrainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "disciplineDefId" TEXT,
    "rankOrder" INTEGER NOT NULL,

    CONSTRAINT "TitleDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTitle" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "titleDefId" TEXT NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleNumber" INTEGER NOT NULL,

    CONSTRAINT "AnimalTitle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalEquipment" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "equippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrainingActionDef_gameId_name_key" ON "TrainingActionDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "IntensityTierDef_gameId_tierIndex_key" ON "IntensityTierDef"("gameId", "tierIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalEnergy_animalId_key" ON "AnimalEnergy"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalCondition_animalId_key" ON "AnimalCondition"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalMood_animalId_key" ON "AnimalMood"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalPersonality_animalId_key" ON "AnimalPersonality"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "StageActivityDef_gameId_name_key" ON "StageActivityDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ClinicEntry_clinicId_animalId_key" ON "ClinicEntry"("clinicId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "HiredTrainer_jobContractId_key" ON "HiredTrainer"("jobContractId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTitle_animalId_titleDefId_key" ON "AnimalTitle"("animalId", "titleDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalEquipment_animalId_slot_key" ON "AnimalEquipment"("animalId", "slot");

-- AddForeignKey
ALTER TABLE "TrainingActionDef" ADD CONSTRAINT "TrainingActionDef_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingActionDef" ADD CONSTRAINT "TrainingActionDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntensityTierDef" ADD CONSTRAINT "IntensityTierDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLog" ADD CONSTRAINT "TrainingLog_performedByPlayerId_fkey" FOREIGN KEY ("performedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLog" ADD CONSTRAINT "TrainingLog_intensityTierDefId_fkey" FOREIGN KEY ("intensityTierDefId") REFERENCES "IntensityTierDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLog" ADD CONSTRAINT "TrainingLog_trainingActionDefId_fkey" FOREIGN KEY ("trainingActionDefId") REFERENCES "TrainingActionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingLog" ADD CONSTRAINT "TrainingLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalEnergy" ADD CONSTRAINT "AnimalEnergy_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCondition" ADD CONSTRAINT "AnimalCondition_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalMood" ADD CONSTRAINT "AnimalMood_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalPersonality" ADD CONSTRAINT "AnimalPersonality_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityDef" ADD CONSTRAINT "StageActivityDef_lifeStageId_fkey" FOREIGN KEY ("lifeStageId") REFERENCES "LifeStageDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityDef" ADD CONSTRAINT "StageActivityDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityLog" ADD CONSTRAINT "StageActivityLog_performedByPlayerId_fkey" FOREIGN KEY ("performedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityLog" ADD CONSTRAINT "StageActivityLog_stageActivityDefId_fkey" FOREIGN KEY ("stageActivityDefId") REFERENCES "StageActivityDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityLog" ADD CONSTRAINT "StageActivityLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_hostPlayerId_fkey" FOREIGN KEY ("hostPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicEntry" ADD CONSTRAINT "ClinicEntry_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicEntry" ADD CONSTRAINT "ClinicEntry_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicEntry" ADD CONSTRAINT "ClinicEntry_clinicId_fkey" FOREIGN KEY ("clinicId") REFERENCES "Clinic"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiredTrainer" ADD CONSTRAINT "HiredTrainer_hiredByPlayerId_fkey" FOREIGN KEY ("hiredByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiredTrainer" ADD CONSTRAINT "HiredTrainer_trainerPlayerId_fkey" FOREIGN KEY ("trainerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleDef" ADD CONSTRAINT "TitleDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTitle" ADD CONSTRAINT "AnimalTitle_titleDefId_fkey" FOREIGN KEY ("titleDefId") REFERENCES "TitleDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTitle" ADD CONSTRAINT "AnimalTitle_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalEquipment" ADD CONSTRAINT "AnimalEquipment_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
