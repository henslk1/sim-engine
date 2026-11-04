-- Fix a competition's score at entry instead of assembling it at resolution.
--
-- A score was built entirely from the live world at the moment the resolver
-- reached it: the animal's personality and conformation as they then stood, its
-- genotype crossed against the venue's expression rules, the discipline's
-- weights as the admin had them, and a divisor read from the game's records.
-- Every one of those moves after a player enters. Bonding a horse, having it
-- inspected, an admin reweighting a discipline, and another player training a
-- different horse into a new record all changed what an entry already made was
-- worth. Burying a horse before the competition ran deleted three of the four
-- inputs outright and scored it zero.
--
-- Two columns' worth of freezing, at two different moments.
--
-- `Competition.scoringRules` holds what the whole field has to share - the stat
-- weights, their divisors, the personality bands, the environmental reaction of
-- every genotype at this venue, whether this is conformation, and the venue
-- itself - taken once when the first entry is accepted. A field in which two
-- horses were measured differently is not a field, and every one of those is
-- something an administrator can edit or another player's training can move
-- while the competition is still open.
--
-- The four on `CompetitionEntry` hold that entry's own finished factors, worked
-- out against those rules as it is accepted. Resolution multiplies them and
-- adds its variance; it reads nothing about the animal any more.
--
-- No backfill, deliberately. The inputs an existing open entry was made under
-- are gone - that is the whole problem - so there is nothing truthful to write
-- into these columns for it, and inventing today's values would be the live
-- read this replaces, just performed once and written down. Entries that
-- predate this keep scoring the old way until they resolve, and
-- `CompetitionEntry.scoredAt` is what tells the two apart. It has to be its own
-- column rather than a null check on the others, because every one of them has
-- a legitimate zero: a disqualified conformation score IS 0, an untrained stat
-- score IS 0, and a genotype the venue does nothing to IS 0.

ALTER TABLE "Competition"
  ADD COLUMN "scoringRules" JSONB;

ALTER TABLE "CompetitionEntry"
  ADD COLUMN "scoredAt"              TIMESTAMP(3),
  ADD COLUMN "statScore"             DOUBLE PRECISION,
  ADD COLUMN "personalityMultiplier" DOUBLE PRECISION,
  ADD COLUMN "conformationScore"     DOUBLE PRECISION,
  ADD COLUMN "environmentModifier"   DOUBLE PRECISION;
