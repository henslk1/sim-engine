-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "breederId" TEXT;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_breederId_fkey" FOREIGN KEY ("breederId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
