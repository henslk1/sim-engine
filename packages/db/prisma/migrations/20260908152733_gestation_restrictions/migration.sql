-- AlterTable
ALTER TABLE "ActivityRestriction" ADD COLUMN     "pregnancyId" TEXT;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "gestationRestrictCycle" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "ActivityRestriction" ADD CONSTRAINT "ActivityRestriction_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "Pregnancy"("id") ON DELETE SET NULL ON UPDATE CASCADE;
