/*
  Warnings:

  - You are about to drop the column `personalityEffect` on the `StageActivityDef` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `AnimalCondition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AnimalEnergy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `AnimalMood` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `result` on the `AnimalTestResult` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `averageTotalInnate` to the `GameInnateMax` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `source` on the `GroupPrestigeLog` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `updatedAt` to the `MarketplaceListing` table without a default value. This is not possible if the table is not empty.
  - Added the required column `traitDefId` to the `StageActivityDef` table without a default value. This is not possible if the table is not empty.
  - Added the required column `traitEffect` to the `StageActivityDef` table without a default value. This is not possible if the table is not empty.
  - Made the column `energyCost` on table `StageActivityDef` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "PrestigeSource" AS ENUM ('COMPETITION_PLACEMENT', 'COMPETITION_HOSTED', 'CLINIC_HOSTED', 'SEASON_RANKING');

-- CreateEnum
CREATE TYPE "TestResultOutcome" AS ENUM ('POSITIVE', 'NEGATIVE', 'INCONCLUSIVE');

-- DropIndex
DROP INDEX "AnimalTestResult_animalId_conditionDefId_key";

-- AlterTable
ALTER TABLE "AnimalCondition" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AnimalEnergy" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AnimalGenotype" ADD COLUMN     "testedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AnimalMood" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "AnimalTestResult" DROP COLUMN "result",
ADD COLUMN     "result" "TestResultOutcome" NOT NULL;

-- AlterTable
ALTER TABLE "Clinic" ADD COLUMN     "energyCost" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "CompetitionTierDef" ADD COLUMN     "energyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "breedingEnergyCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GameInnateMax" ADD COLUMN     "averageTotalInnate" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "GroupPrestige" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GroupPrestigeLog" DROP COLUMN "source",
ADD COLUMN     "source" "PrestigeSource" NOT NULL;

-- AlterTable
ALTER TABLE "HealthConditionDef" ADD COLUMN     "moodEffect" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "PersonalityTraitDef" ADD COLUMN     "conceptionModifier" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "moodModifier" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "trainingModifier" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StageActivityDef" DROP COLUMN "personalityEffect",
ADD COLUMN     "traitDefId" TEXT NOT NULL,
ADD COLUMN     "traitEffect" DOUBLE PRECISION NOT NULL,
ALTER COLUMN "energyCost" SET NOT NULL;

-- CreateTable
CREATE TABLE "DisciplinePersonalityWeight" (
    "id" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "traitDefId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DisciplinePersonalityWeight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisciplinePersonalityWeight_disciplineDefId_traitDefId_key" ON "DisciplinePersonalityWeight"("disciplineDefId", "traitDefId");

-- AddForeignKey
ALTER TABLE "DisciplinePersonalityWeight" ADD CONSTRAINT "DisciplinePersonalityWeight_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinePersonalityWeight" ADD CONSTRAINT "DisciplinePersonalityWeight_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageActivityDef" ADD CONSTRAINT "StageActivityDef_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
