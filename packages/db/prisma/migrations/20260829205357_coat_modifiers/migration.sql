-- AlterTable
ALTER TABLE "Locus" ADD COLUMN     "inheritanceWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "isHiddenModifier" BOOLEAN NOT NULL DEFAULT false;
