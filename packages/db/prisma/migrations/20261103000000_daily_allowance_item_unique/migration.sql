-- Give an item allowance the same uniqueness rule a currency allowance has.
--
-- `DailyAllowanceCurrency` has been unique on (game, currency, subscriberOnly)
-- since it was made, and `DailyAllowanceItem` was not unique on anything. The
-- two are read by the same grant and mean the same thing, so the difference was
-- an oversight rather than a decision, and it showed in two places at once: the
-- table allowed two rows for one item in one game, which the grant would have
-- summed into a double helping, and the admin picker - having no constraint to
-- follow - keyed its "already configured" filter on the item alone. That made
-- the open row and the subscriber-only row mutually exclusive in the interface
-- while the table happily allowed both, which is the one combination the
-- feature is actually for.
--
-- Checked before writing this: `DailyAllowanceItem` holds no rows at all in
-- dev or in the scratch copy, so there is nothing to collapse first. A database
-- that does have duplicates will refuse this index rather than silently keep
-- one row, which is the right way round.

CREATE UNIQUE INDEX "DailyAllowanceItem_gameId_itemDefId_subscriberOnly_key"
  ON "DailyAllowanceItem"("gameId", "itemDefId", "subscriberOnly");
