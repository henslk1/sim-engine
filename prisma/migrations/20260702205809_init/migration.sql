-- CreateEnum
CREATE TYPE "ProfileFieldKey" AS ENUM ('BIO', 'GROUPS', 'ACHIEVEMENTS', 'FORUM_ACTIVITY', 'LEADERBOARD_PLACINGS', 'MARKETPLACE_LISTINGS', 'CLINICS', 'PLAYER_SHOP');

-- CreateTable
CREATE TABLE "PlayerProfile" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "bio" TEXT,
    "bannerPath" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileVisibilitySetting" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "fieldKey" "ProfileFieldKey" NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProfileVisibilitySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerSeniority" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "activeDaysPlayed" INTEGER NOT NULL DEFAULT 0,
    "lastActiveDateAt" TIMESTAMP(3),
    "tutorialCompleted" BOOLEAN NOT NULL DEFAULT false,
    "gatesBypassesd" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlayerSeniority_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorialStepDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stepIndex" INTEGER NOT NULL,

    CONSTRAINT "TutorialStepDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorialProgress" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "stepDefId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "TutorialProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AchievementDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "achievementKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconPath" TEXT,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "goalValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AchievementDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAchievement" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "achievementDefId" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "earnedAt" TIMESTAMP(3),

    CONSTRAINT "PlayerAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerReputation" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "averageRating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalRatings" INTEGER NOT NULL DEFAULT 0,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightlyUpdateLog" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorMessage" TEXT,
    "animalsAged" INTEGER NOT NULL DEFAULT 0,
    "animalDeaths" INTEGER NOT NULL DEFAULT 0,
    "lifeStageTransitions" INTEGER NOT NULL DEFAULT 0,
    "storeRotationsProcessed" INTEGER NOT NULL DEFAULT 0,
    "rafflesDrawn" INTEGER NOT NULL DEFAULT 0,
    "jobContractsProcessed" INTEGER NOT NULL DEFAULT 0,
    "seasonRewardsDistributed" INTEGER NOT NULL DEFAULT 0,
    "campaignPhaseTransitions" INTEGER NOT NULL DEFAULT 0,
    "subscriptionsExpired" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NightlyUpdateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerProfile_playerAccountId_key" ON "PlayerProfile"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileVisibilitySetting_playerAccountId_fieldKey_key" ON "ProfileVisibilitySetting"("playerAccountId", "fieldKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerSeniority_playerAccountId_key" ON "PlayerSeniority"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialStepDef_gameId_stepKey_key" ON "TutorialStepDef"("gameId", "stepKey");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialStepDef_gameId_stepIndex_key" ON "TutorialStepDef"("gameId", "stepIndex");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialProgress_playerAccountId_stepDefId_key" ON "TutorialProgress"("playerAccountId", "stepDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AchievementDef_gameId_achievementKey_key" ON "AchievementDef"("gameId", "achievementKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerReputation_playerAccountId_key" ON "PlayerReputation"("playerAccountId");

-- AddForeignKey
ALTER TABLE "PlayerProfile" ADD CONSTRAINT "PlayerProfile_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileVisibilitySetting" ADD CONSTRAINT "ProfileVisibilitySetting_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerSeniority" ADD CONSTRAINT "PlayerSeniority_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialStepDef" ADD CONSTRAINT "TutorialStepDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialProgress" ADD CONSTRAINT "TutorialProgress_stepDefId_fkey" FOREIGN KEY ("stepDefId") REFERENCES "TutorialStepDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialProgress" ADD CONSTRAINT "TutorialProgress_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AchievementDef" ADD CONSTRAINT "AchievementDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAchievement" ADD CONSTRAINT "PlayerAchievement_achievementDefId_fkey" FOREIGN KEY ("achievementDefId") REFERENCES "AchievementDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAchievement" ADD CONSTRAINT "PlayerAchievement_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerReputation" ADD CONSTRAINT "PlayerReputation_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightlyUpdateLog" ADD CONSTRAINT "NightlyUpdateLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
