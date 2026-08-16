-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'TREATMENT_FEE';

-- AlterTable
ALTER TABLE "TreatmentDef" ADD COLUMN     "cost" INTEGER,
ADD COLUMN     "currencyDefId" TEXT;

-- AddForeignKey
ALTER TABLE "TreatmentDef" ADD CONSTRAINT "TreatmentDef_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
