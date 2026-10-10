-- Durable per-competition resolution work.
--
-- Resolution was already crash-safe: runCompetition is one transaction, so a
-- crash rolls back and the competition is OPEN again. This table carries the
-- retry accounting, chunking and analytics around it.

-- CreateTable
CREATE TABLE "CompetitionResolutionWork" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionResolutionWork_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionResolutionWork_competitionId_key" ON "CompetitionResolutionWork"("competitionId");

-- CreateIndex
CREATE INDEX "CompetitionResolutionWork_gameId_status_idx" ON "CompetitionResolutionWork"("gameId", "status");

-- CreateIndex
CREATE INDEX "CompetitionResolutionWork_status_leaseUntil_idx" ON "CompetitionResolutionWork"("status", "leaseUntil");

-- AddForeignKey
ALTER TABLE "CompetitionResolutionWork" ADD CONSTRAINT "CompetitionResolutionWork_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResolutionWork" ADD CONSTRAINT "CompetitionResolutionWork_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
