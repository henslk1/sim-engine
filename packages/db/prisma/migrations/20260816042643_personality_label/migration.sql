/*
  Warnings:

  - You are about to drop the column `conceptionModifier` on the `PersonalityTraitDef` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "PersonalityLabelRange" ADD COLUMN     "conceptionModifier" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PersonalityTraitDef" DROP COLUMN "conceptionModifier";
