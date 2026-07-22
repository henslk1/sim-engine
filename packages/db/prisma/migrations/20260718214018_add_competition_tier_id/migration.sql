-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "tierDefId" TEXT;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_tierDefId_fkey" FOREIGN KEY ("tierDefId") REFERENCES "CompetitionTierDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
