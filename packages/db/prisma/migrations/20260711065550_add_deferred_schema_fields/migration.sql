-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "AnimalAncestor" ADD COLUMN     "position" INTEGER;

-- AlterTable
ALTER TABLE "AnimalGenotype" ADD COLUMN     "testedCycle" INTEGER;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "maxLocusTestsPerCycle" INTEGER NOT NULL DEFAULT 2;

-- AlterTable
ALTER TABLE "Locus" ADD COLUMN     "minTestCycle" INTEGER;

-- AlterTable
ALTER TABLE "LongTermCareActionDef" ADD COLUMN     "currencyAmount" INTEGER;
