/*
  Warnings:

  - You are about to drop the column `competitionsPerDay` on the `VenueDiscipline` table. All the data in the column will be lost.
  - Added the required column `tierDefId` to the `CompetitionEntry` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "CompetitionEntry" ADD COLUMN     "tierDefId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "VenueDiscipline" DROP COLUMN "competitionsPerDay",
ADD COLUMN     "maxOpenAtOnce" INTEGER NOT NULL DEFAULT 1;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_tierDefId_fkey" FOREIGN KEY ("tierDefId") REFERENCES "CompetitionTierDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
