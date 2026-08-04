/*
  Warnings:

  - Added the required column `severity` to the `BugReport` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "BugReport" ADD COLUMN     "severity" "BugSeverity" NOT NULL;
