/*
  Warnings:

  - You are about to drop the column `gatesBypassesd` on the `PlayerSeniority` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[gameId,username]` on the table `PlayerAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "PrizeType" AS ENUM ('CURRENCY', 'ITEM');

-- AlterTable
ALTER TABLE "PlayerSeniority" DROP COLUMN "gatesBypassesd",
ADD COLUMN     "gatesBypassed" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TutorialAnimalPair" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "ancestorOneId" TEXT NOT NULL,
    "ancestorTwoId" TEXT NOT NULL,
    "embryoId" TEXT NOT NULL,

    CONSTRAINT "TutorialAnimalPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonPrizeConfig" (
    "id" TEXT NOT NULL,
    "seasonCategoryId" TEXT NOT NULL,
    "currencyDefId" TEXT,
    "itemDefId" TEXT,
    "rankFrom" INTEGER NOT NULL,
    "rankTo" INTEGER NOT NULL,
    "prizeType" "PrizeType" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "SeasonPrizeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarterBreedOption" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StarterBreedOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StarterColorOption" (
    "id" TEXT NOT NULL,
    "starterBreedOptionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StarterColorOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialAnimalPair_playerAccountId_key" ON "TutorialAnimalPair"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialAnimalPair_ancestorOneId_key" ON "TutorialAnimalPair"("ancestorOneId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialAnimalPair_ancestorTwoId_key" ON "TutorialAnimalPair"("ancestorTwoId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorialAnimalPair_embryoId_key" ON "TutorialAnimalPair"("embryoId");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonPrizeConfig_seasonCategoryId_rankFrom_rankTo_key" ON "SeasonPrizeConfig"("seasonCategoryId", "rankFrom", "rankTo");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerAccount_gameId_username_key" ON "PlayerAccount"("gameId", "username");

-- AddForeignKey
ALTER TABLE "TutorialAnimalPair" ADD CONSTRAINT "TutorialAnimalPair_embryoId_fkey" FOREIGN KEY ("embryoId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialAnimalPair" ADD CONSTRAINT "TutorialAnimalPair_ancestorTwoId_fkey" FOREIGN KEY ("ancestorTwoId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialAnimalPair" ADD CONSTRAINT "TutorialAnimalPair_ancestorOneId_fkey" FOREIGN KEY ("ancestorOneId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialAnimalPair" ADD CONSTRAINT "TutorialAnimalPair_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPrizeConfig" ADD CONSTRAINT "SeasonPrizeConfig_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPrizeConfig" ADD CONSTRAINT "SeasonPrizeConfig_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonPrizeConfig" ADD CONSTRAINT "SeasonPrizeConfig_seasonCategoryId_fkey" FOREIGN KEY ("seasonCategoryId") REFERENCES "SeasonCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterBreedOption" ADD CONSTRAINT "StarterBreedOption_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterColorOption" ADD CONSTRAINT "StarterColorOption_starterBreedOptionId_fkey" FOREIGN KEY ("starterBreedOptionId") REFERENCES "StarterBreedOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
