/*
  Warnings:

  - The values [ART,MECHANIC] on the enum `BugCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `body` on the `BugReport` table. All the data in the column will be lost.
  - You are about to drop the column `isExploit` on the `BugReport` table. All the data in the column will be lost.
  - You are about to drop the column `severity` on the `BugReport` table. All the data in the column will be lost.
  - Added the required column `description` to the `BugReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `expectedOutcome` to the `BugReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pageUrl` to the `BugReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `stepsToReproduce` to the `BugReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `category` to the `SupportTicket` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SupportTicketCategory" AS ENUM ('GENERAL', 'EXPLOIT', 'BILLING', 'ACCOUNT', 'APPEAL', 'DISPUTE');

-- AlterEnum
BEGIN;
CREATE TYPE "BugCategory_new" AS ENUM ('VISUAL', 'TEXT', 'UI', 'GAMEPLAY', 'ECONOMY', 'PERFORMANCE');
ALTER TABLE "BugReport" ALTER COLUMN "category" TYPE "BugCategory_new" USING ("category"::text::"BugCategory_new");
ALTER TYPE "BugCategory" RENAME TO "BugCategory_old";
ALTER TYPE "BugCategory_new" RENAME TO "BugCategory";
DROP TYPE "public"."BugCategory_old";
COMMIT;

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BugStatus" ADD VALUE 'NEEDS_MORE_INFO';
ALTER TYPE "BugStatus" ADD VALUE 'NOT_A_BUG';

-- AlterTable
ALTER TABLE "BugReport" DROP COLUMN "body",
DROP COLUMN "isExploit",
DROP COLUMN "severity",
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "claimedAt" TIMESTAMP(3),
ADD COLUMN     "claimedByUserId" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "errorMessages" TEXT,
ADD COLUMN     "expectedOutcome" TEXT NOT NULL,
ADD COLUMN     "pageUrl" TEXT NOT NULL,
ADD COLUMN     "screenshotUrls" TEXT[],
ADD COLUMN     "stepsToReproduce" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "category" "SupportTicketCategory" NOT NULL;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
