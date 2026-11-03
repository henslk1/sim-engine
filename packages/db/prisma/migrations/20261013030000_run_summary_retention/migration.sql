-- Keep the run, prune the detail.
--
-- Retention previously deleted whole `ScheduledTaskRun` rows, which cascaded
-- their `NightlyAnimalWork` and `ScheduledTaskRunSample` rows and so removed
-- the runs from analytics entirely. Everything the run detail page derives --
-- retried items, pregnancies completed, peak and per-worker throughput, and
-- the per-animal timing distribution -- lived only in those detail rows.
--
-- These columns hold that summary, finalized when a run finishes. The run row
-- is then kept indefinitely (three a day) and only the detail expires, so the
-- history, the comparisons and the timing baseline all survive.
--
-- No backfill. A run that finished before this existed has no summary and
-- cannot be given one; null means "never measured", which the panel shows as
-- unavailable rather than as zero.
ALTER TABLE "ScheduledTaskRun"
  ADD COLUMN "retriedItemCount"     INTEGER,
  ADD COLUMN "pregnanciesCompleted" INTEGER,
  ADD COLUMN "peakRatePerSecond"    DOUBLE PRECISION,
  ADD COLUMN "workerSeconds"        DOUBLE PRECISION,
  ADD COLUMN "durationMeasured"     INTEGER,
  ADD COLUMN "durationMinMs"        INTEGER,
  ADD COLUMN "durationAvgMs"        DOUBLE PRECISION,
  ADD COLUMN "durationP50Ms"        INTEGER,
  ADD COLUMN "durationP95Ms"        INTEGER,
  ADD COLUMN "durationP99Ms"        INTEGER,
  ADD COLUMN "durationMaxMs"        INTEGER,
  ADD COLUMN "detailPrunedAt"       TIMESTAMP(3);

-- How long the detail is kept. Only the detail -- see above.
ALTER TABLE "GameConfig"
  ADD COLUMN "workRetentionDays" INTEGER NOT NULL DEFAULT 30;
