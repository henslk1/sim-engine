/*
  Warnings:

  - You are about to drop the column `baseline` on the `BreedStatProfile` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Breed" ADD COLUMN     "coatWeight" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BreedStatProfile" DROP COLUMN "baseline";

-- AlterTable
ALTER TABLE "GeneticPanelDef" ADD COLUMN     "colorRole" TEXT;

-- CreateTable
CREATE TABLE "BreedCoatSelection" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "colorRole" TEXT NOT NULL,

    CONSTRAINT "BreedCoatSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreedCoatSelection_breedId_expression_key" ON "BreedCoatSelection"("breedId", "expression");

-- AddForeignKey
ALTER TABLE "BreedCoatSelection" ADD CONSTRAINT "BreedCoatSelection_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
