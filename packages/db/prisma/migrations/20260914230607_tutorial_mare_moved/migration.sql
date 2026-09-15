/*
  Warnings:

  - You are about to drop the column `tutorialFemalePrice` on the `StarterBreedOption` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "tutorialFemalePrice" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StarterBreedOption" DROP COLUMN "tutorialFemalePrice";
