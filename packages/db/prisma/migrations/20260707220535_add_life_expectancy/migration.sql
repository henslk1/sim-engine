-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "energyLowCarePenalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "energyLowCareThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HealthConditionDef" ADD COLUMN     "energyEffect" DOUBLE PRECISION;
