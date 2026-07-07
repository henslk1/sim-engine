/*
  Warnings:

  - You are about to drop the column `minEntries` on the `Competition` table. All the data in the column will be lost.
  - You are about to drop the column `dueAt` on the `Pregnancy` table. All the data in the column will be lost.
  - You are about to drop the `PrizeConfig` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[groupId]` on the table `Venue` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `innateMax` to the `AnimalImmunity` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxEntries` to the `Competition` table without a default value. This is not possible if the table is not empty.
  - Added the required column `requiredCycles` to the `Pregnancy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `defaultMaxEntries` to the `VenueDiscipline` table without a default value. This is not possible if the table is not empty.
  - Added the required column `defaultMaxWaitHours` to the `VenueDiscipline` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PrizeConfig" DROP CONSTRAINT "PrizeConfig_competitionId_fkey";

-- AlterTable
ALTER TABLE "AnimalImmunity" ADD COLUMN     "innateMax" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "Competition" DROP COLUMN "minEntries",
ADD COLUMN     "breedId" TEXT,
ADD COLUMN     "maxEntries" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "CompetitionTierDef" ADD COLUMN     "minWeeklyPointsForInvitational" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "careScoreCeiling" DOUBLE PRECISION NOT NULL DEFAULT 100,
ADD COLUMN     "careScoreDecayRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "careScoreFloor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "careScoreRecoveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "conditionDecayRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "conditionWorkGain" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gestationCycles" INTEGER NOT NULL DEFAULT 12,
ADD COLUMN     "immunityDecayRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "immunityRecoveryRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "moodDecayRate" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GroupPrestigeTierDef" ADD COLUMN     "canHaveVenue" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canHostInvitational" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "entryFeeSharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "LifeStageDef" ADD COLUMN     "immunityCapMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Pregnancy" DROP COLUMN "dueAt",
ADD COLUMN     "currentCycles" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredCycles" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Venue" ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "rotationOrder" INTEGER;

-- AlterTable
ALTER TABLE "VenueDiscipline" ADD COLUMN     "competitionsPerDay" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "defaultMaxEntries" INTEGER NOT NULL,
ADD COLUMN     "defaultMaxWaitHours" INTEGER NOT NULL,
ADD COLUMN     "invitationalMaxEntries" INTEGER,
ADD COLUMN     "invitationalMaxWaitHours" INTEGER,
ADD COLUMN     "isInvitationalEligible" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "PrizeConfig";

-- CreateTable
CREATE TABLE "CompetitionTierPrize" (
    "id" TEXT NOT NULL,
    "tierDefId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "currencyDefId" TEXT,
    "amount" INTEGER NOT NULL,
    "isInvitational" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CompetitionTierPrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineEquipmentRequirement" (
    "id" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "DisciplineEquipmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionTierPrize_tierDefId_placement_isInvitational_key" ON "CompetitionTierPrize"("tierDefId", "placement", "isInvitational");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineEquipmentRequirement_disciplineDefId_itemDefId_key" ON "DisciplineEquipmentRequirement"("disciplineDefId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_groupId_key" ON "Venue"("groupId");

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTierPrize" ADD CONSTRAINT "CompetitionTierPrize_tierDefId_fkey" FOREIGN KEY ("tierDefId") REFERENCES "CompetitionTierDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTierPrize" ADD CONSTRAINT "CompetitionTierPrize_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineEquipmentRequirement" ADD CONSTRAINT "DisciplineEquipmentRequirement_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineEquipmentRequirement" ADD CONSTRAINT "DisciplineEquipmentRequirement_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
