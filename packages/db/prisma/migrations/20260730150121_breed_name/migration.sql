-- DropForeignKey
ALTER TABLE "Animal" DROP CONSTRAINT "Animal_breedId_fkey";

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "breedName" TEXT,
ALTER COLUMN "breedId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;
