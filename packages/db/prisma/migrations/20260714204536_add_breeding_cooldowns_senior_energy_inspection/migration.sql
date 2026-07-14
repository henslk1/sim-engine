-- AlterEnum
ALTER TYPE "VetServiceType" ADD VALUE 'PREGNANCY_ABORT';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "breedingCooldownUntilCycle" INTEGER,
ADD COLUMN     "geneticCollectionCooldownUntilCycle" INTEGER;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "breedingCooldownCycles" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "conformationInspectionMinCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "geneticCollectionCooldownCycles" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LifeStageDef" ADD COLUMN     "energyRestoreMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1;
