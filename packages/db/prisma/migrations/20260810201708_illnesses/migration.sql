-- CreateEnum
CREATE TYPE "ConditionTriggerType" AS ENUM ('VET_PROCEDURE', 'TRAINING_TIER');

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "overworkInjuryChance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "overworkInjuryThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "HealthConditionDef" ADD COLUMN     "flareupCooldownCycles" INTEGER,
ADD COLUMN     "isEpisodic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "procedureFatalityRisk" DOUBLE PRECISION,
ADD COLUMN     "suppressionItemDefId" TEXT;

-- CreateTable
CREATE TABLE "ConditionTrigger" (
    "id" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,
    "triggerType" "ConditionTriggerType" NOT NULL,
    "minTierIndex" INTEGER,
    "triggerChance" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "ConditionTrigger_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "HealthConditionDef" ADD CONSTRAINT "HealthConditionDef_suppressionItemDefId_fkey" FOREIGN KEY ("suppressionItemDefId") REFERENCES "ItemDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConditionTrigger" ADD CONSTRAINT "ConditionTrigger_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
