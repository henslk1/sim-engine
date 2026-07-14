/*
  Warnings:

  - You are about to drop the column `energyRestoreMultiplier` on the `LifeStageDef` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "LifeStageDef" DROP COLUMN "energyRestoreMultiplier",
ADD COLUMN     "energyCostMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;
