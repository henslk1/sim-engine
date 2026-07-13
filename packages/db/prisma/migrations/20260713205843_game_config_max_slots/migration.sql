/*
  Warnings:

  - You are about to drop the column `maxSlots` on the `BreedingListing` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "BreedingListing" DROP COLUMN "maxSlots";

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "maxBreedingSlots" INTEGER;
