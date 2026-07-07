-- AlterEnum
ALTER TYPE "AnimalStatus" ADD VALUE 'DECEASED';

-- AlterTable
ALTER TABLE "LifeStageDef" ADD COLUMN     "deathChancePerCycle" DOUBLE PRECISION,
ADD COLUMN     "deathChanceStartCycle" INTEGER;
