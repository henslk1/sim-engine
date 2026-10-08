-- CreateEnum
CREATE TYPE "ScheduledTaskType" AS ENUM ('NIGHTLY', 'COMPETITION_SWEEP', 'VENUE_ROTATION');

-- CreateEnum
CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('PENDING', 'RUNNING', 'RETRYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "competitionSweepMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "gameTimeZone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN     "nightlyRunHour" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nightlyRunMinute" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ScheduledTask" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "taskType" "ScheduledTaskType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "taskType" "ScheduledTaskType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'PENDING',
    "claimedBy" TEXT,
    "claimedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3),
    "heartbeatAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "retriedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTask_enabled_nextRunAt_idx" ON "ScheduledTask"("enabled", "nextRunAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTask_gameId_taskType_key" ON "ScheduledTask"("gameId", "taskType");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_status_leaseUntil_idx" ON "ScheduledTaskRun"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_gameId_taskType_startedAt_idx" ON "ScheduledTaskRun"("gameId", "taskType", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledTaskRun_gameId_taskType_scheduledFor_key" ON "ScheduledTaskRun"("gameId", "taskType", "scheduledFor");

-- AddForeignKey
ALTER TABLE "ScheduledTask" ADD CONSTRAINT "ScheduledTask_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ScheduledTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskRun" ADD CONSTRAINT "ScheduledTaskRun_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
