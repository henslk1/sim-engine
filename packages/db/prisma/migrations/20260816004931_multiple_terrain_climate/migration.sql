/*
  Warnings:

  - Changed the column `preferredClimate` on the `Animal` table from a scalar field to a list field. If there are non-null values in that column, this step will fail.
  - Changed the column `preferredTerrain` on the `Animal` table from a scalar field to a list field. If there are non-null values in that column, this step will fail.

*/
-- AlterTable
ALTER TABLE "Animal"
ALTER COLUMN "preferredClimate" SET DATA TYPE "VenueClimate"[] USING CASE WHEN "preferredClimate" IS NULL THEN ARRAY[]::"VenueClimate"[] ELSE ARRAY["preferredClimate"]::"VenueClimate"[] END,
ALTER COLUMN "preferredTerrain" SET DATA TYPE "VenueTerrain"[] USING CASE WHEN "preferredTerrain" IS NULL THEN ARRAY[]::"VenueTerrain"[] ELSE ARRAY["preferredTerrain"]::"VenueTerrain"[] END;
