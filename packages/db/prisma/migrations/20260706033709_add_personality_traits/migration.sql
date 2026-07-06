/*
  Warnings:

  - A unique constraint covering the columns `[animalId,traitDefId]` on the table `AnimalPersonality` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `traitDefId` to the `AnimalPersonality` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "AnimalPersonality_animalId_key";

-- AlterTable
ALTER TABLE "AnimalPersonality" ADD COLUMN     "traitDefId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "BreedPersonalityProfile" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "traitDefId" TEXT NOT NULL,
    "naturalMin" DOUBLE PRECISION NOT NULL,
    "naturalMax" DOUBLE PRECISION NOT NULL,
    "baseline" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BreedPersonalityProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalityTraitDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "PersonalityTraitDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalityLabelRange" (
    "id" TEXT NOT NULL,
    "traitDefId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,
    "maxValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PersonalityLabelRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreedPersonalityProfile_breedId_traitDefId_key" ON "BreedPersonalityProfile"("breedId", "traitDefId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalityTraitDef_gameId_name_key" ON "PersonalityTraitDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalPersonality_animalId_traitDefId_key" ON "AnimalPersonality"("animalId", "traitDefId");

-- AddForeignKey
ALTER TABLE "BreedPersonalityProfile" ADD CONSTRAINT "BreedPersonalityProfile_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedPersonalityProfile" ADD CONSTRAINT "BreedPersonalityProfile_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalityTraitDef" ADD CONSTRAINT "PersonalityTraitDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalityLabelRange" ADD CONSTRAINT "PersonalityLabelRange_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalPersonality" ADD CONSTRAINT "AnimalPersonality_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
