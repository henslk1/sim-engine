/*
  Warnings:

  - You are about to drop the column `naturalMax` on the `BreedStatProfile` table. All the data in the column will be lost.
  - You are about to drop the column `naturalMin` on the `BreedStatProfile` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[breedId,locusId,idealExpressionLabel]` on the table `BreedConformationStandard` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "BreedConformationStandard_breedId_locusId_key";

-- AlterTable
ALTER TABLE "BreedStatProfile" DROP COLUMN "naturalMax",
DROP COLUMN "naturalMin";

-- CreateIndex
CREATE UNIQUE INDEX "BreedConformationStandard_breedId_locusId_idealExpressionLa_key" ON "BreedConformationStandard"("breedId", "locusId", "idealExpressionLabel");
