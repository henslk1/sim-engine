/*
  Warnings:

  - The `notes` column on the `Animal` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `description` column on the `BreedingListing` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Animal" DROP COLUMN "notes",
ADD COLUMN     "notes" JSONB;

-- AlterTable
ALTER TABLE "BreedingListing" DROP COLUMN "description",
ADD COLUMN     "description" JSONB;
