/*
  Warnings:

  - Added the required column `conditionType` to the `HealthConditionDef` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "HealthConditionType" AS ENUM ('ILLNESS', 'INJURY');

-- AlterTable
ALTER TABLE "ExpressionRule" ADD COLUMN     "penetrance" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "HealthConditionDef" ADD COLUMN     "conditionType" "HealthConditionType" NOT NULL,
ADD COLUMN     "fatalMaxCycle" INTEGER,
ADD COLUMN     "fatalityChance" DOUBLE PRECISION,
ADD COLUMN     "onsetMinCycle" INTEGER;
