-- Add penetrance to join table before dropping from ExpressionRule
ALTER TABLE "ExpressionRuleCondition" ADD COLUMN "penetrance" DOUBLE PRECISION;

-- Migrate existing penetrance values from ExpressionRule to all linked condition rows
UPDATE "ExpressionRuleCondition" rc
SET "penetrance" = r."penetrance"
FROM "ExpressionRule" r
WHERE rc."expressionRuleId" = r.id
  AND r."penetrance" IS NOT NULL;

-- AlterTable
ALTER TABLE "ExpressionRule" DROP COLUMN "penetrance";
