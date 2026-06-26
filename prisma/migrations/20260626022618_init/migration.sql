-- CreateEnum
CREATE TYPE "GeneticPanelType" AS ENUM ('HEALTH', 'CONFORMATION');

-- CreateTable
CREATE TABLE "Locus" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayGroup" TEXT,

    CONSTRAINT "Locus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allele" (
    "id" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,

    CONSTRAINT "Allele_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressionRule" (
    "id" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "alleleOneId" TEXT NOT NULL,
    "alleleTwoId" TEXT NOT NULL,
    "phenotype" TEXT NOT NULL,
    "numericModifier" DOUBLE PRECISION,

    CONSTRAINT "ExpressionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneAvailabilityState" (
    "id" TEXT NOT NULL,
    "alleleId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT false,
    "madeAvailableAt" TIMESTAMP(3),

    CONSTRAINT "GeneAvailabilityState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneticPanelDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "panelType" "GeneticPanelType" NOT NULL,

    CONSTRAINT "GeneticPanelDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneticPanelLocus" (
    "id" TEXT NOT NULL,
    "panelDefId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,

    CONSTRAINT "GeneticPanelLocus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedAlleleFrequency" (
    "id" TEXT NOT NULL,
    "alleleId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "frequency" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BreedAlleleFrequency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalGenotype" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "alleleOneId" TEXT NOT NULL,
    "alleleTwoId" TEXT NOT NULL,
    "isTestedByOwner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnimalGenotype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalConformationScore" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalConformationScore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Locus_gameId_name_key" ON "Locus"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Allele_locusId_symbol_key" ON "Allele"("locusId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressionRule_locusId_alleleOneId_alleleTwoId_key" ON "ExpressionRule"("locusId", "alleleOneId", "alleleTwoId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneAvailabilityState_alleleId_key" ON "GeneAvailabilityState"("alleleId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneticPanelDef_gameId_name_key" ON "GeneticPanelDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GeneticPanelLocus_panelDefId_locusId_key" ON "GeneticPanelLocus"("panelDefId", "locusId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedAlleleFrequency_breedId_alleleId_key" ON "BreedAlleleFrequency"("breedId", "alleleId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalGenotype_animalId_locusId_key" ON "AnimalGenotype"("animalId", "locusId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalConformationScore_animalId_breedId_key" ON "AnimalConformationScore"("animalId", "breedId");

-- AddForeignKey
ALTER TABLE "Locus" ADD CONSTRAINT "Locus_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allele" ADD CONSTRAINT "Allele_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRule" ADD CONSTRAINT "ExpressionRule_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRule" ADD CONSTRAINT "ExpressionRule_alleleOneId_fkey" FOREIGN KEY ("alleleOneId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionRule" ADD CONSTRAINT "ExpressionRule_alleleTwoId_fkey" FOREIGN KEY ("alleleTwoId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneAvailabilityState" ADD CONSTRAINT "GeneAvailabilityState_alleleId_fkey" FOREIGN KEY ("alleleId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticPanelDef" ADD CONSTRAINT "GeneticPanelDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticPanelLocus" ADD CONSTRAINT "GeneticPanelLocus_panelDefId_fkey" FOREIGN KEY ("panelDefId") REFERENCES "GeneticPanelDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticPanelLocus" ADD CONSTRAINT "GeneticPanelLocus_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedAlleleFrequency" ADD CONSTRAINT "BreedAlleleFrequency_alleleId_fkey" FOREIGN KEY ("alleleId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedAlleleFrequency" ADD CONSTRAINT "BreedAlleleFrequency_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalGenotype" ADD CONSTRAINT "AnimalGenotype_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalGenotype" ADD CONSTRAINT "AnimalGenotype_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalGenotype" ADD CONSTRAINT "AnimalGenotype_alleleOneId_fkey" FOREIGN KEY ("alleleOneId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalGenotype" ADD CONSTRAINT "AnimalGenotype_alleleTwoId_fkey" FOREIGN KEY ("alleleTwoId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalConformationScore" ADD CONSTRAINT "AnimalConformationScore_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalConformationScore" ADD CONSTRAINT "AnimalConformationScore_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
