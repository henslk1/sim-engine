-- AlterTable
ALTER TABLE "AnimalConformationScore" ADD COLUMN     "isCoatDq" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "AnimalGenotype" ADD COLUMN     "phenotypeCode" TEXT;

-- CreateTable
CREATE TABLE "BreedCoatDqSelection" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "colorRole" TEXT NOT NULL,

    CONSTRAINT "BreedCoatDqSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreedCoatDqSelection_breedId_expression_key" ON "BreedCoatDqSelection"("breedId", "expression");

-- AddForeignKey
ALTER TABLE "BreedCoatDqSelection" ADD CONSTRAINT "BreedCoatDqSelection_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
