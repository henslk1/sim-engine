-- `claimChunk` asks for one run's claimable work in creation order:
--
--   WHERE "runId" = $1
--     AND (status IN ('PENDING','RETRYING')
--          OR (status = 'RUNNING' AND ("leaseUntil" <= now() OR "leaseUntil" IS NULL)))
--   ORDER BY "createdAt" LIMIT 250
--
-- The OR defeated `NightlyAnimalWork_runId_status_idx`. EXPLAIN on the dev
-- database showed the planner reaching for `NightlyAnimalWork_status_leaseUntil_idx`
-- and applying `runId` as a post-filter on the heap, which means every chunk
-- scanned every PENDING, RETRYING and RUNNING row in the whole table -- every
-- run that ever left one behind -- and discarded the rows belonging to other
-- runs. The cost of claiming a chunk therefore grew with the history of the
-- table rather than with the size of the run.
--
-- Leading with "runId" bounds the scan to the run doing the asking; "createdAt"
-- behind it supplies the ordering so the limit can stop early instead of
-- sorting the run's whole backlog once per chunk.
CREATE INDEX "NightlyAnimalWork_runId_createdAt_status_idx"
  ON "NightlyAnimalWork" ("runId", "createdAt", "status");
