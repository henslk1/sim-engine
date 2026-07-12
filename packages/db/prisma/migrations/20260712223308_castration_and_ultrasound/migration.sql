-- AlterEnum
ALTER TYPE "VetServiceType" ADD VALUE 'CASTRATION';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "isPinned" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "ultrasoundOpenCycle" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GeneticPanelDef" ADD COLUMN     "testCost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Pregnancy" ADD COLUMN     "ultrasoundUsed" BOOLEAN NOT NULL DEFAULT false;
