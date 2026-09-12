-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "secondaryDisciplineDefId" TEXT;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_secondaryDisciplineDefId_fkey" FOREIGN KEY ("secondaryDisciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
