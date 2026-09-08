-- AlterTable
ALTER TABLE "HealthCertificateDef" ADD COLUMN     "cost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currencyDefId" TEXT;

-- AddForeignKey
ALTER TABLE "HealthCertificateDef" ADD CONSTRAINT "HealthCertificateDef_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
