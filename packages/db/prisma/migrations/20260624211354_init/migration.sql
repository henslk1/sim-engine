-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('MINOR', 'MAJOR', 'GAME_BREAKING');

-- CreateEnum
CREATE TYPE "BugCategory" AS ENUM ('ART', 'TEXT', 'UI', 'MECHANIC');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'CONFIRMED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "BugSeverity" NOT NULL,
    "category" "BugCategory" NOT NULL,
    "isExploit" BOOLEAN NOT NULL DEFAULT false,
    "status" "BugStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReportUpvote" (
    "id" TEXT NOT NULL,
    "bugReportId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReportUpvote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReportComment" (
    "id" TEXT NOT NULL,
    "bugReportId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BugReportComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminActionLog" (
    "id" TEXT NOT NULL,
    "staffUserId" TEXT NOT NULL,
    "gameId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameConfig" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "crossFirstGenDefaultTotalInnate" INTEGER NOT NULL,
    "trainingCeilingMultiplier" DOUBLE PRECISION NOT NULL,
    "pedigreeDisplayDepth" INTEGER NOT NULL,
    "predictorDailyLimitFree" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BugReportUpvote_bugReportId_playerAccountId_key" ON "BugReportUpvote"("bugReportId", "playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GameConfig_gameId_key" ON "GameConfig"("gameId");

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportUpvote" ADD CONSTRAINT "BugReportUpvote_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportUpvote" ADD CONSTRAINT "BugReportUpvote_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportComment" ADD CONSTRAINT "BugReportComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReportComment" ADD CONSTRAINT "BugReportComment_bugReportId_fkey" FOREIGN KEY ("bugReportId") REFERENCES "BugReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_staffUserId_fkey" FOREIGN KEY ("staffUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminActionLog" ADD CONSTRAINT "AdminActionLog_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
