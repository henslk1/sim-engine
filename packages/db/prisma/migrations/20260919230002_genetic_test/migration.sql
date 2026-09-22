-- AlterTable
ALTER TABLE "AnimalConformationScore" ADD COLUMN     "isTraitDq" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "completeProfileTestCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "completeProfileTestCurrencyDefId" TEXT;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_completeProfileTestCurrencyDefId_fkey" FOREIGN KEY ("completeProfileTestCurrencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
