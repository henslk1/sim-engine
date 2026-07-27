/*
  Warnings:

  - Added the required column `sex` to the `AnimalTemplate` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "AnimalTemplate" DROP CONSTRAINT "AnimalTemplate_breedId_fkey";

-- DropForeignKey
ALTER TABLE "StarterBreedOption" DROP CONSTRAINT "StarterBreedOption_tutorialFemaleTemplateId_fkey";

-- DropForeignKey
ALTER TABLE "StarterBreedOption" DROP CONSTRAINT "StarterBreedOption_tutorialMaleTemplateId_fkey";

-- AlterTable
ALTER TABLE "AnimalTemplate" ADD COLUMN     "breedName" TEXT,
ADD COLUMN     "fertility" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "sex" "AnimalSex" NOT NULL,
ADD COLUMN     "startingAgeInCycles" INTEGER,
ALTER COLUMN "breedId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AnimalTemplateStat" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "innateValue" DOUBLE PRECISION,
    "trainedValue" DOUBLE PRECISION,

    CONSTRAINT "AnimalTemplateStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTemplateCompTier" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "disciplineId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,

    CONSTRAINT "AnimalTemplateCompTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTemplateStat_templateId_statDefId_key" ON "AnimalTemplateStat"("templateId", "statDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTemplateCompTier_templateId_disciplineId_key" ON "AnimalTemplateCompTier"("templateId", "disciplineId");

-- AddForeignKey
ALTER TABLE "AnimalTemplate" ADD CONSTRAINT "AnimalTemplate_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateStat" ADD CONSTRAINT "AnimalTemplateStat_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnimalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateStat" ADD CONSTRAINT "AnimalTemplateStat_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateCompTier" ADD CONSTRAINT "AnimalTemplateCompTier_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnimalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateCompTier" ADD CONSTRAINT "AnimalTemplateCompTier_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_tutorialMaleTemplateId_fkey" FOREIGN KEY ("tutorialMaleTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_tutorialFemaleTemplateId_fkey" FOREIGN KEY ("tutorialFemaleTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
