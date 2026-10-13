-- How long aging one animal actually took.
--
-- `startedAt` is stamped on every item in a chunk at once, by `claimChunk`, so
-- `completedAt - startedAt` measures the item's position in the queue rather
-- than its cost. This is measured around the aging call itself.
--
-- Nullable with no backfill: the column is only meaningful from the first run
-- after it exists, and a null here means "not measured", not "took no time".
ALTER TABLE "NightlyAnimalWork" ADD COLUMN "durationMs" INTEGER;
