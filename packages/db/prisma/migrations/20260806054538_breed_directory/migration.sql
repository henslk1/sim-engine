-- AlterTable
ALTER TABLE "Breed" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "preferredClimate" "VenueClimate",
ADD COLUMN     "preferredTerrain" "VenueTerrain";
