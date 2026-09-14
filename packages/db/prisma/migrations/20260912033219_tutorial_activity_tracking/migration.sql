-- CreateEnum
CREATE TYPE "TutorialCompletionCondition" AS ENUM ('TRAINING_CAPPED', 'COMPETITION_TIER', 'PREGNANCY_COMPLETE', 'LIFE_STAGE');

-- AlterTable
ALTER TABLE "TutorialStepDef" ADD COLUMN     "completionCondition" "TutorialCompletionCondition",
ADD COLUMN     "completionTarget" INTEGER;
