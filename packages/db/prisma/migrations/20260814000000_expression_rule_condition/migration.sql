-- CreateTable
CREATE TABLE "ExpressionRuleCondition" (
    "id" TEXT NOT NULL,
    "expressionRuleId" TEXT NOT NULL,
    "healthConditionDefId" TEXT NOT NULL,
    "environmentalRiskModifier" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ExpressionRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExpressionRuleCondition_expressionRuleId_healthConditionDef_key" ON "ExpressionRuleCondition"("expressionRuleId", "healthConditionDefId");

-- AddForeignKey
ALTER TABLE "ExpressionRuleCondition" ADD CONSTRAINT "ExpressionRuleCondition_expressionRuleId_fkey" FOREIGN KEY ("expressionRuleId") REFERENCES "ExpressionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRuleCondition" ADD CONSTRAINT "ExpressionRuleCondition_healthConditionDefId_fkey" FOREIGN KEY ("healthConditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Migrate existing condition links to join table
INSERT INTO "ExpressionRuleCondition" ("id", "expressionRuleId", "healthConditionDefId", "environmentalRiskModifier")
SELECT gen_random_uuid()::text, id, "healthConditionDefId", "environmentalRiskModifier"
FROM "ExpressionRule"
WHERE "healthConditionDefId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "ExpressionRule" DROP CONSTRAINT "ExpressionRule_healthConditionDefId_fkey";

-- AlterTable
ALTER TABLE "ExpressionRule" DROP COLUMN "environmentalRiskModifier",
DROP COLUMN "healthConditionDefId";
