/*
  Warnings:

  - You are about to drop the column `disciplineId` on the `AnimalTemplateCompTier` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[templateId,disciplineDefId]` on the table `AnimalTemplateCompTier` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `disciplineDefId` to the `AnimalTemplateCompTier` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AnimalTemplateCompTier" DROP CONSTRAINT "AnimalTemplateCompTier_disciplineId_fkey";

-- DropIndex
DROP INDEX "AnimalTemplateCompTier_templateId_disciplineId_key";

-- AlterTable
ALTER TABLE "AnimalTemplateCompTier" DROP COLUMN "disciplineId",
ADD COLUMN     "disciplineDefId" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTemplateCompTier_templateId_disciplineDefId_key" ON "AnimalTemplateCompTier"("templateId", "disciplineDefId");

-- AddForeignKey
ALTER TABLE "AnimalTemplateCompTier" ADD CONSTRAINT "AnimalTemplateCompTier_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
