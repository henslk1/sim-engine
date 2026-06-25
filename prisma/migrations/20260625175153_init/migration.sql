/*
  Warnings:

  - You are about to drop the column `crossFirstGenDefaultTotalInnate` on the `GameConfig` table. All the data in the column will be lost.
  - Added the required column `defaultInnateRatio` to the `GameConfig` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('ALIVE', 'ARCHIVED', 'BURIED');

-- CreateEnum
CREATE TYPE "AnimalSex" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "BreedCategoryBadge" AS ENUM ('BASE', 'SECONDARY', 'CUSTOM');

-- AlterTable
ALTER TABLE "GameConfig" DROP COLUMN "crossFirstGenDefaultTotalInnate",
ADD COLUMN     "defaultInnateRatio" DOUBLE PRECISION NOT NULL;

-- CreateTable
CREATE TABLE "Species" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Species_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LifeStageDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "minCycle" INTEGER NOT NULL,
    "maxCycle" INTEGER NOT NULL,
    "canCompete" BOOLEAN NOT NULL,
    "canBreed" BOOLEAN NOT NULL,
    "canTrain" BOOLEAN NOT NULL,
    "canReceiveCare" BOOLEAN NOT NULL,
    "hasUniqueActionSet" BOOLEAN NOT NULL DEFAULT false,
    "profileLayout" TEXT NOT NULL,

    CONSTRAINT "LifeStageDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "StatDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Breed" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "speciesId" TEXT NOT NULL,
    "categoryBadge" "BreedCategoryBadge" NOT NULL,
    "foundingPlayerId" TEXT,
    "image" TEXT,
    "lore" TEXT,
    "isUnregistered" BOOLEAN NOT NULL DEFAULT false,
    "convergenceGenerations" INTEGER,

    CONSTRAINT "Breed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedStatProfile" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    "naturalMin" DOUBLE PRECISION NOT NULL,
    "naturalMax" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BreedStatProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sex" "AnimalSex" NOT NULL,
    "lifeStageId" TEXT NOT NULL,
    "image" TEXT,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "ageInCycles" INTEGER NOT NULL DEFAULT 0,
    "bornAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diedAt" TIMESTAMP(3),
    "causeOfDeath" TEXT,
    "status" "AnimalStatus" NOT NULL DEFAULT 'ALIVE',
    "deletedAt" TIMESTAMP(3),
    "isCastrated" BOOLEAN NOT NULL DEFAULT false,
    "inbreedingCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fertility" DOUBLE PRECISION NOT NULL,
    "isTutorialAnimal" BOOLEAN NOT NULL DEFAULT false,
    "breedGeneration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalStat" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "innateValue" DOUBLE PRECISION NOT NULL,
    "trainedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "AnimalStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalStatHistory" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "trainedValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalStatHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalAncestor" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "ancestorId" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "AnimalAncestor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBreedComposition" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "percentage" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalBreedComposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameInnateMax" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "maxTotalInnate" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameInnateMax_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerBrand" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBrand" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "playerBrandId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalBrand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalDailyLog" (
    "id" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "animalId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "partnerAnimalId" TEXT,
    "outcome" TEXT,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalDailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Species_gameId_name_key" ON "Species"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LifeStageDef_gameId_stageIndex_key" ON "LifeStageDef"("gameId", "stageIndex");

-- CreateIndex
CREATE UNIQUE INDEX "StatDef_gameId_name_key" ON "StatDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Breed_gameId_name_key" ON "Breed"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BreedStatProfile_breedId_statDefId_key" ON "BreedStatProfile"("breedId", "statDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalStat_animalId_statDefId_key" ON "AnimalStat"("animalId", "statDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalStatHistory_animalId_statDefId_cycleNumber_key" ON "AnimalStatHistory"("animalId", "statDefId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalAncestor_animalId_ancestorId_key" ON "AnimalAncestor"("animalId", "ancestorId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalBreedComposition_animalId_breedId_key" ON "AnimalBreedComposition"("animalId", "breedId");

-- CreateIndex
CREATE UNIQUE INDEX "GameInnateMax_gameId_key" ON "GameInnateMax"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerBrand_playerAccountId_key" ON "PlayerBrand"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalBrand_animalId_playerBrandId_key" ON "AnimalBrand"("animalId", "playerBrandId");

-- AddForeignKey
ALTER TABLE "Species" ADD CONSTRAINT "Species_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeStageDef" ADD CONSTRAINT "LifeStageDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatDef" ADD CONSTRAINT "StatDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breed" ADD CONSTRAINT "Breed_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breed" ADD CONSTRAINT "Breed_speciesId_fkey" FOREIGN KEY ("speciesId") REFERENCES "Species"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Breed" ADD CONSTRAINT "Breed_foundingPlayerId_fkey" FOREIGN KEY ("foundingPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedStatProfile" ADD CONSTRAINT "BreedStatProfile_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedStatProfile" ADD CONSTRAINT "BreedStatProfile_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_lifeStageId_fkey" FOREIGN KEY ("lifeStageId") REFERENCES "LifeStageDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalStat" ADD CONSTRAINT "AnimalStat_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalStat" ADD CONSTRAINT "AnimalStat_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalStatHistory" ADD CONSTRAINT "AnimalStatHistory_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalStatHistory" ADD CONSTRAINT "AnimalStatHistory_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalAncestor" ADD CONSTRAINT "AnimalAncestor_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalAncestor" ADD CONSTRAINT "AnimalAncestor_ancestorId_fkey" FOREIGN KEY ("ancestorId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBreedComposition" ADD CONSTRAINT "AnimalBreedComposition_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBreedComposition" ADD CONSTRAINT "AnimalBreedComposition_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameInnateMax" ADD CONSTRAINT "GameInnateMax_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerBrand" ADD CONSTRAINT "PlayerBrand_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBrand" ADD CONSTRAINT "AnimalBrand_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBrand" ADD CONSTRAINT "AnimalBrand_playerBrandId_fkey" FOREIGN KEY ("playerBrandId") REFERENCES "PlayerBrand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalDailyLog" ADD CONSTRAINT "AnimalDailyLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalDailyLog" ADD CONSTRAINT "AnimalDailyLog_partnerAnimalId_fkey" FOREIGN KEY ("partnerAnimalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
