/*
  Warnings:

  - Added the required column `entryFee` to the `CompetitionTierDef` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompetitionTierDef" ADD COLUMN     "entryFee" INTEGER NOT NULL;
