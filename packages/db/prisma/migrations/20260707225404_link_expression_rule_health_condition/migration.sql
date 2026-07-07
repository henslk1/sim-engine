-- AlterTable
ALTER TABLE "ExpressionRule" ADD COLUMN     "healthConditionDefId" TEXT;

-- AddForeignKey
ALTER TABLE "ExpressionRule" ADD CONSTRAINT "ExpressionRule_healthConditionDefId_fkey" FOREIGN KEY ("healthConditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
