/*
  Warnings:

  - You are about to drop the column `maxCycle` on the `LifeStageDef` table. All the data in the column will be lost.
  - Added the required column `ageCap` to the `LifeStageDef` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "LifeStageDef" DROP COLUMN "maxCycle",
ADD COLUMN     "ageCap" INTEGER NOT NULL;
