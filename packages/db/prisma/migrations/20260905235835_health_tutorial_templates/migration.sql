/*
  Warnings:

  - You are about to drop the column `healthClear` on the `AnimalTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnimalTemplate" DROP COLUMN "healthClear",
ADD COLUMN     "baseTutorialTemplateId" TEXT;

-- AlterTable
ALTER TABLE "AnimalTemplateGenotype" ADD COLUMN     "isTestedByOwner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "tutorialFemaleBaseTemplateId" TEXT,
ADD COLUMN     "tutorialMaleBaseTemplateId" TEXT;

-- CreateTable
CREATE TABLE "AnimalTemplatePersonality" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "traitDefId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalTemplatePersonality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTemplatePersonality_templateId_traitDefId_key" ON "AnimalTemplatePersonality"("templateId", "traitDefId");

-- AddForeignKey
ALTER TABLE "AnimalTemplate" ADD CONSTRAINT "AnimalTemplate_baseTutorialTemplateId_fkey" FOREIGN KEY ("baseTutorialTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplatePersonality" ADD CONSTRAINT "AnimalTemplatePersonality_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnimalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplatePersonality" ADD CONSTRAINT "AnimalTemplatePersonality_traitDefId_fkey" FOREIGN KEY ("traitDefId") REFERENCES "PersonalityTraitDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_tutorialMaleBaseTemplateId_fkey" FOREIGN KEY ("tutorialMaleBaseTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameConfig" ADD CONSTRAINT "GameConfig_tutorialFemaleBaseTemplateId_fkey" FOREIGN KEY ("tutorialFemaleBaseTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
