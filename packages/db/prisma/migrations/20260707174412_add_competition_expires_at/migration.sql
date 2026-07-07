/*
  Warnings:

  - Added the required column `expiresAt` to the `Competition` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "expiresAt" TIMESTAMP(3) NOT NULL;
