-- Attribute a resolution work item to the sweep that enqueued it.
--
-- Nullable because the other half of the queue has no run behind it: a
-- competition that fills up enqueues itself from the entering player's
-- transaction. Without this, the sweep analytics could only ever show the
-- game's whole queue, which is right for a sweep that is still draining and
-- wrong for every sweep before it.
--
-- SetNull on delete, matching NightlyUpdateLog: runs are the prunable half of
-- the pair, and losing the attribution must not lose the work record.

-- AlterTable
ALTER TABLE "CompetitionResolutionWork" ADD COLUMN "runId" TEXT;

-- CreateIndex
CREATE INDEX "CompetitionResolutionWork_runId_idx" ON "CompetitionResolutionWork"("runId");

-- AddForeignKey
ALTER TABLE "CompetitionResolutionWork" ADD CONSTRAINT "CompetitionResolutionWork_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduledTaskRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
