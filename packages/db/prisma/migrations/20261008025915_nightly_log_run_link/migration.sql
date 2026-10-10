-- Link each nightly log to the scheduled run that produced it.
--
-- Nullable: logs written before the database scheduler existed have no run.
-- Unique: a run has one log however many attempts it takes.

-- AlterTable
ALTER TABLE "NightlyUpdateLog" ADD COLUMN     "runId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "NightlyUpdateLog_runId_key" ON "NightlyUpdateLog"("runId");

-- AddForeignKey
ALTER TABLE "NightlyUpdateLog" ADD CONSTRAINT "NightlyUpdateLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduledTaskRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
