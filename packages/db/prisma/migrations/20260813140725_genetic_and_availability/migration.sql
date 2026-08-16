/*
  Warnings:

  - You are about to drop the column `moodModifier` on the `PersonalityTraitDef` table. All the data in the column will be lost.
  - You are about to drop the column `trainingModifier` on the `PersonalityTraitDef` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "preferredClimate" "VenueClimate",
ADD COLUMN     "preferredTerrain" "VenueTerrain",
ADD COLUMN     "structuralRisk" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Breed" ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PersonalityLabelRange" ADD COLUMN     "moodModifier" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "trainingModifier" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PersonalityTraitDef" DROP COLUMN "moodModifier",
DROP COLUMN "trainingModifier";
