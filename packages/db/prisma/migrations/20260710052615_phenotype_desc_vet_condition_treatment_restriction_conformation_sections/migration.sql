-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "phenotypeDescription" TEXT;

-- AlterTable
ALTER TABLE "VetVisitLog" ADD COLUMN     "conditionDefId" TEXT;

-- CreateTable
CREATE TABLE "ConformationSection" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConformationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConformationSectionEntry" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ConformationSectionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalConformationSectionScore" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalConformationSectionScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentRestrictionDef" (
    "id" TEXT NOT NULL,
    "treatmentDefId" TEXT NOT NULL,
    "restrictionType" "ActivityRestrictionType" NOT NULL,
    "maxIntensityTier" INTEGER,
    "durationCycles" INTEGER,

    CONSTRAINT "TreatmentRestrictionDef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConformationSection_gameId_name_key" ON "ConformationSection"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ConformationSectionEntry_sectionId_locusId_key" ON "ConformationSectionEntry"("sectionId", "locusId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalConformationSectionScore_animalId_breedId_sectionId_key" ON "AnimalConformationSectionScore"("animalId", "breedId", "sectionId");

-- AddForeignKey
ALTER TABLE "ConformationSection" ADD CONSTRAINT "ConformationSection_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConformationSectionEntry" ADD CONSTRAINT "ConformationSectionEntry_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ConformationSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConformationSectionEntry" ADD CONSTRAINT "ConformationSectionEntry_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalConformationSectionScore" ADD CONSTRAINT "AnimalConformationSectionScore_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalConformationSectionScore" ADD CONSTRAINT "AnimalConformationSectionScore_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalConformationSectionScore" ADD CONSTRAINT "AnimalConformationSectionScore_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ConformationSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentRestrictionDef" ADD CONSTRAINT "TreatmentRestrictionDef_treatmentDefId_fkey" FOREIGN KEY ("treatmentDefId") REFERENCES "TreatmentDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetVisitLog" ADD CONSTRAINT "VetVisitLog_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
