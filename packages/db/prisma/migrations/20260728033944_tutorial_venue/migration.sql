-- AlterTable
ALTER TABLE "TutorialStepDef" ADD COLUMN     "venueId" TEXT;

-- AddForeignKey
ALTER TABLE "TutorialStepDef" ADD CONSTRAINT "TutorialStepDef_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
