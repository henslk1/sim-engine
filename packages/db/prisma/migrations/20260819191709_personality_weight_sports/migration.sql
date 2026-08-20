/*
  Warnings:

  - You are about to drop the column `minScore` on the `CompetitionTierDef` table. All the data in the column will be lost.
  - You are about to drop the column `weight` on the `DisciplinePersonalityWeight` table. All the data in the column will be lost.
  - Added the required column `bonusPercent` to the `DisciplinePersonalityWeight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idealMax` to the `DisciplinePersonalityWeight` table without a default value. This is not possible if the table is not empty.
  - Added the required column `idealMin` to the `DisciplinePersonalityWeight` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompetitionTierDef" DROP COLUMN "minScore",
ADD COLUMN     "minConditionScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "DisciplinePersonalityWeight" DROP COLUMN "weight",
ADD COLUMN     "bonusPercent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "idealMax" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "idealMin" DOUBLE PRECISION NOT NULL;
