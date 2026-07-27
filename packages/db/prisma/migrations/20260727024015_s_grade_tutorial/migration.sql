-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "tutorialPlayerAccountId" TEXT;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "topGradeDoubleBonusChance" DOUBLE PRECISION NOT NULL DEFAULT 0.1;

-- AlterTable
ALTER TABLE "StarterBreedOption" ADD COLUMN     "tutorialFemaleTemplateId" TEXT,
ADD COLUMN     "tutorialMaleTemplateId" TEXT;

-- AlterTable
ALTER TABLE "TutorialStepDef" ADD COLUMN     "competitionDisciplineId" TEXT,
ADD COLUMN     "competitionNpcCount" INTEGER,
ADD COLUMN     "triggerConditionDefId" TEXT;

-- AddForeignKey
ALTER TABLE "TutorialStepDef" ADD CONSTRAINT "TutorialStepDef_competitionDisciplineId_fkey" FOREIGN KEY ("competitionDisciplineId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialStepDef" ADD CONSTRAINT "TutorialStepDef_triggerConditionDefId_fkey" FOREIGN KEY ("triggerConditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_tutorialPlayerAccountId_fkey" FOREIGN KEY ("tutorialPlayerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_tutorialMaleTemplateId_fkey" FOREIGN KEY ("tutorialMaleTemplateId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_tutorialFemaleTemplateId_fkey" FOREIGN KEY ("tutorialFemaleTemplateId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
