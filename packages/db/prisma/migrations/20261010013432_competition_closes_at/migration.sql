-- `Competition.expiresAt` becomes a nullable `closesAt`.
--
-- Renamed rather than dropped and re-added so the resolution times already on
-- completed competitions survive as history.

-- AlterTable
ALTER TABLE "Competition" RENAME COLUMN "expiresAt" TO "closesAt";
ALTER TABLE "Competition" ALTER COLUMN "closesAt" DROP NOT NULL;

-- An open competition nobody has entered has no deadline at all. This is the
-- backfill that stops the churn: these stop coming due, stop being resolved
-- empty, and stop being regenerated.
UPDATE "Competition" c
   SET "closesAt" = NULL
 WHERE c."status" = 'OPEN'
   AND NOT EXISTS (SELECT 1 FROM "CompetitionEntry" e WHERE e."competitionId" = c."id");

-- An open competition that already has entries closes at the next sweep.
--
-- `NOW() AT TIME ZONE 'UTC'` and not bare `NOW()`: these columns are
-- timestamp(3) holding UTC, and a Postgres session is not necessarily on UTC
-- (the dev one runs on America/Chicago), so bare NOW() would write a value
-- hours adrift from everything it is compared against.
UPDATE "Competition" c
   SET "closesAt" = (NOW() AT TIME ZONE 'UTC')
 WHERE c."status" = 'OPEN'
   AND EXISTS (SELECT 1 FROM "CompetitionEntry" e WHERE e."competitionId" = c."id");

-- CreateIndex
CREATE INDEX "Competition_gameId_status_closesAt_idx" ON "Competition"("gameId", "status", "closesAt");
