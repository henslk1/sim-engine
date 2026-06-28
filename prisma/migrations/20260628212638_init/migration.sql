-- CreateEnum
CREATE TYPE "BreedingSlotStatus" AS ENUM ('AVAILABLE', 'PURCHASED', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GeneticMaterialType" AS ENUM ('SPERM', 'EGG', 'EMBRYO');

-- CreateEnum
CREATE TYPE "GeneticStorageType" AS ENUM ('PERSONAL', 'VET', 'GROUP');

-- CreateTable
CREATE TABLE "BreedingListing" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "ownerPlayerId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "description" TEXT,
    "currencyDefId" TEXT,
    "pricePerSlot" INTEGER NOT NULL,
    "maxSlots" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BreedingListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingListingBreedRestriction" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,

    CONSTRAINT "BreedingListingBreedRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingListingStatMinimum" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "minValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BreedingListingStatMinimum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingSlot" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "purchasedByPlayerId" TEXT,
    "status" "BreedingSlotStatus" NOT NULL,
    "purchasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreedingSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedingRecord" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sireId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "breedingSlotId" TEXT,
    "geneticMaterialId" TEXT,
    "sireSnapshot" JSONB NOT NULL,
    "damSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreedingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneticMaterial" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "ownerPlayerId" TEXT NOT NULL,
    "groupId" TEXT,
    "donorSnapshot" JSONB,
    "offspringSnapshot" JSONB,
    "inbreedingCoefficient" DOUBLE PRECISION,
    "producedByBreedingRecordId" TEXT,
    "materialType" "GeneticMaterialType" NOT NULL,
    "storageType" "GeneticStorageType" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneticMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pregnancy" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "breedingRecordId" TEXT NOT NULL,
    "isSurrogate" BOOLEAN NOT NULL DEFAULT false,
    "gestationStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Pregnancy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PregnancyOffspring" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "pregnancyId" TEXT NOT NULL,
    "birthOrder" INTEGER,

    CONSTRAINT "PregnancyOffspring_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurrogacyRecord" (
    "id" TEXT NOT NULL,
    "pregnancyId" TEXT NOT NULL,
    "biologicalDamId" TEXT NOT NULL,
    "geneticMaterialId" TEXT,
    "implantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurrogacyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreedingListingBreedRestriction_listingId_breedId_key" ON "BreedingListingBreedRestriction"("listingId", "breedId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedingListingStatMinimum_listingId_statDefId_key" ON "BreedingListingStatMinimum"("listingId", "statDefId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedingRecord_breedingSlotId_key" ON "BreedingRecord"("breedingSlotId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedingRecord_geneticMaterialId_key" ON "BreedingRecord"("geneticMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneticMaterial_producedByBreedingRecordId_key" ON "GeneticMaterial"("producedByBreedingRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Pregnancy_breedingRecordId_key" ON "Pregnancy"("breedingRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "PregnancyOffspring_pregnancyId_animalId_key" ON "PregnancyOffspring"("pregnancyId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "SurrogacyRecord_pregnancyId_key" ON "SurrogacyRecord"("pregnancyId");

-- CreateIndex
CREATE UNIQUE INDEX "SurrogacyRecord_geneticMaterialId_key" ON "SurrogacyRecord"("geneticMaterialId");

-- AddForeignKey
ALTER TABLE "BreedingListing" ADD CONSTRAINT "BreedingListing_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListing" ADD CONSTRAINT "BreedingListing_ownerPlayerId_fkey" FOREIGN KEY ("ownerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListing" ADD CONSTRAINT "BreedingListing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListingBreedRestriction" ADD CONSTRAINT "BreedingListingBreedRestriction_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListingBreedRestriction" ADD CONSTRAINT "BreedingListingBreedRestriction_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "BreedingListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListingStatMinimum" ADD CONSTRAINT "BreedingListingStatMinimum_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListingStatMinimum" ADD CONSTRAINT "BreedingListingStatMinimum_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "BreedingListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingSlot" ADD CONSTRAINT "BreedingSlot_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "BreedingListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingSlot" ADD CONSTRAINT "BreedingSlot_purchasedByPlayerId_fkey" FOREIGN KEY ("purchasedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_breedingSlotId_fkey" FOREIGN KEY ("breedingSlotId") REFERENCES "BreedingSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingRecord" ADD CONSTRAINT "BreedingRecord_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticMaterial" ADD CONSTRAINT "GeneticMaterial_producedByBreedingRecordId_fkey" FOREIGN KEY ("producedByBreedingRecordId") REFERENCES "BreedingRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticMaterial" ADD CONSTRAINT "GeneticMaterial_ownerPlayerId_fkey" FOREIGN KEY ("ownerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticMaterial" ADD CONSTRAINT "GeneticMaterial_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticMaterial" ADD CONSTRAINT "GeneticMaterial_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregnancy" ADD CONSTRAINT "Pregnancy_breedingRecordId_fkey" FOREIGN KEY ("breedingRecordId") REFERENCES "BreedingRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pregnancy" ADD CONSTRAINT "Pregnancy_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyOffspring" ADD CONSTRAINT "PregnancyOffspring_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "Pregnancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PregnancyOffspring" ADD CONSTRAINT "PregnancyOffspring_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurrogacyRecord" ADD CONSTRAINT "SurrogacyRecord_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurrogacyRecord" ADD CONSTRAINT "SurrogacyRecord_biologicalDamId_fkey" FOREIGN KEY ("biologicalDamId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurrogacyRecord" ADD CONSTRAINT "SurrogacyRecord_pregnancyId_fkey" FOREIGN KEY ("pregnancyId") REFERENCES "Pregnancy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
