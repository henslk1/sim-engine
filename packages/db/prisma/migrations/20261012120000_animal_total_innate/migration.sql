-- `Animal.totalInnate`: the sum of the animal's `AnimalStat.innateValue`.
--
-- The nightly recalculates `GameInnateMax` by grouping every stat row of every
-- living animal and summing per animal, then returning one row per animal for
-- Node to reduce. On this database that is a HashAggregate over a hash join of
-- the whole `AnimalStat` table, and the result set grows with the population.
-- With this column it becomes `max()`/`avg()` over `Animal`, returning one row.
--
-- Safe as a stored sum because `innateValue` is immutable: it is written when
-- an animal's stat rows are created and has no update path. Training writes
-- `trainedValue`; the only `AnimalStat` deletes are burial's prune and the
-- offspring cleanup that deletes the animal in the same transaction.
--
-- Nullable, with no default. An animal with no stat rows produced no row from
-- the grouped query, so it never contributed to the game average; null here
-- reproduces that exactly, because SQL aggregates skip nulls. A `DEFAULT 0`
-- would newly count stored embryos -- which get their stats at birth -- as
-- zeros and pull the average down for everyone.

ALTER TABLE "Animal" ADD COLUMN "totalInnate" DOUBLE PRECISION;

-- Backfill. Animals with no stat rows are left null, which is the point.
UPDATE "Animal" a
   SET "totalInnate" = s.total
  FROM (
        SELECT "animalId", SUM("innateValue") AS total
          FROM "AnimalStat"
         GROUP BY "animalId"
       ) s
 WHERE a.id = s."animalId";
