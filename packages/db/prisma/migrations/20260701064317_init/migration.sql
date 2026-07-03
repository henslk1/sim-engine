/*
  Warnings:

  - The values [GROUP] on the enum `ShopType` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[gameId,breedId,currencyDefId]` on the table `GameShopBreedConfig` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "LocusBiasTarget" AS ENUM ('FAVORABILITY', 'RARITY', 'NONE');

-- CreateEnum
CREATE TYPE "GroupMemberStatus" AS ENUM ('PENDING', 'ACTIVE', 'BANNED', 'LEFT');

-- CreateEnum
CREATE TYPE "GroupAnimalStatus" AS ENUM ('PENDING_ENTRY', 'IN_CONTAINER', 'OUT_OF_CONTAINER');

-- CreateEnum
CREATE TYPE "GroupPermission" AS ENUM ('MANAGE_MEMBERS', 'MANAGE_ROLES', 'ADD_TO_CONTAINER', 'REMOVE_FROM_CONTAINER', 'VIEW_FINANCES', 'MANAGE_FINANCES', 'HOST_EVENTS', 'MANAGE_ENTRY_REQUIREMENTS', 'MANAGE_INVENTORY', 'POST_ANNOUNCEMENT', 'MANAGE_CHANNELS');

-- CreateEnum
CREATE TYPE "GroupActivityType" AS ENUM ('MEMBER_JOINED', 'MEMBER_LEFT', 'MEMBER_INVITED', 'MEMBER_ROLE_CHANGED', 'MEMBER_BANNED', 'ANIMAL_GROUP_JOINED', 'ANIMAL_ENTERED_CONTAINER', 'ANIMAL_LEFT_CONTAINER', 'ANIMAL_SOLD', 'FINANCE_DEPOSIT', 'FINANCE_WITHDRAWAL', 'INVENTORY_ADDED', 'INVENTORY_REMOVED', 'ANNOUNCEMENT_POSTED', 'PRESTIGE_EARNED');

-- CreateEnum
CREATE TYPE "GroupChannelType" AS ENUM ('ANNOUNCEMENT', 'GENERAL', 'ROLE_RESTRICTED');

-- CreateEnum
CREATE TYPE "GroupRequirementType" AS ENUM ('CARE_SCORE', 'COMPETITION_TIER', 'NO_ACTIVE_CONDITIONS', 'GENETIC_PANEL_TESTED', 'NO_ACTIVE_RESTRICTIONS', 'STAT_VALUE', 'CONFORMATION_SCORE', 'PHENOTYPE_EXPRESSION', 'DISCIPLINE_COMPETITION_TIER', 'INBREEDING_COEFFICIENT');

-- CreateEnum
CREATE TYPE "GroupSaleRule" AS ENUM ('REQUIRE_APPROVAL', 'MIN_OFFER_AMOUNT', 'NO_SALE_DURING_SEASON', 'FIRST_REFUSAL');

-- CreateEnum
CREATE TYPE "GroupSpendingCategory" AS ENUM ('BREEDING', 'TRAINING', 'COMPETITION', 'VET', 'ITEM_USE', 'CARE');

-- AlterEnum
BEGIN;
CREATE TYPE "ShopType_new" AS ENUM ('BASE', 'PREMIUM', 'VET');
ALTER TABLE "StoreListing" ALTER COLUMN "shopType" TYPE "ShopType_new" USING ("shopType"::text::"ShopType_new");
ALTER TYPE "ShopType" RENAME TO "ShopType_old";
ALTER TYPE "ShopType_new" RENAME TO "ShopType";
DROP TYPE "public"."ShopType_old";
COMMIT;

-- DropIndex
DROP INDEX "GameShopBreedConfig_gameId_breedId_key";

-- AlterTable
ALTER TABLE "GameShopBreedConfig" ADD COLUMN     "gameShopFloor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "shopAlleleQualityBias" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Locus" ADD COLUMN     "biasTarget" "LocusBiasTarget" NOT NULL DEFAULT 'NONE';

-- AlterTable
ALTER TABLE "MarketplaceListing" ADD COLUMN     "playerStoreId" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionTier" ADD COLUMN     "hasPlayerStore" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PlayerStore" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "banner" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "breedId" TEXT,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "maxMembers" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disbandedAt" TIMESTAMP(3),
    "foundedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disciplineDefId" TEXT,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "groupRoleId" TEXT NOT NULL,
    "status" "GroupMemberStatus" NOT NULL,
    "invitedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joinedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "GroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRole" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isOwner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GroupRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRolePermission" (
    "id" TEXT NOT NULL,
    "groupRoleId" TEXT NOT NULL,
    "permission" "GroupPermission" NOT NULL,

    CONSTRAINT "GroupRolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAnimal" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "status" "GroupAnimalStatus" NOT NULL DEFAULT 'PENDING_ENTRY',
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByPlayerId" TEXT,
    "leftContainerAt" TIMESTAMP(3),

    CONSTRAINT "GroupAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupAnimalSpendingRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "groupRoleId" TEXT NOT NULL,
    "spendingCategory" "GroupSpendingCategory" NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
    "maxAmountPerAnimal" INTEGER,

    CONSTRAINT "GroupAnimalSpendingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupSaleProtectionRule" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "ruleType" "GroupSaleRule" NOT NULL,
    "minOfferAmount" INTEGER,
    "requiredApprovalRoleId" TEXT,
    "conditionStatDefId" TEXT,
    "conditionBreedId" TEXT,
    "conditionMinValue" DOUBLE PRECISION,
    "conditionMaxValue" DOUBLE PRECISION,

    CONSTRAINT "GroupSaleProtectionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupEntryRequirement" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "requirementType" "GroupRequirementType" NOT NULL,
    "minValue" DOUBLE PRECISION,
    "maxValue" DOUBLE PRECISION,
    "statDefId" TEXT,
    "breedId" TEXT,
    "healthConditionDefId" TEXT,
    "geneticPanelDefId" TEXT,
    "disciplineDefId" TEXT,
    "locusId" TEXT,
    "requiredPhenotype" TEXT,

    CONSTRAINT "GroupEntryRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupFinance" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupFinance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupInventory" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GroupInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPrestige" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tierDefId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GroupPrestige_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPrestigeTierDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tierIndex" INTEGER NOT NULL,
    "minScore" DOUBLE PRECISION NOT NULL,
    "maxMembers" INTEGER NOT NULL,
    "maxGroupAnimals" INTEGER NOT NULL,
    "maxHostedShowsPerDay" INTEGER,
    "prestigeCurrencyRewardPerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vetDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "GroupPrestigeTierDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupPrestigeLog" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupPrestigeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupChannel" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channelType" "GroupChannelType" NOT NULL,
    "requiredRoleId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER,

    CONSTRAINT "GroupChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupActivityLog" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "playerAccountId" TEXT,
    "activityType" "GroupActivityType" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerStore_playerAccountId_key" ON "PlayerStore"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMember_groupId_playerAccountId_key" ON "GroupMember"("groupId", "playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRole_groupId_name_key" ON "GroupRole"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupRolePermission_groupRoleId_permission_key" ON "GroupRolePermission"("groupRoleId", "permission");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAnimal_groupId_animalId_key" ON "GroupAnimal"("groupId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupAnimalSpendingRule_groupId_groupRoleId_spendingCategor_key" ON "GroupAnimalSpendingRule"("groupId", "groupRoleId", "spendingCategory");

-- CreateIndex
CREATE UNIQUE INDEX "GroupFinance_groupId_currencyDefId_key" ON "GroupFinance"("groupId", "currencyDefId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupInventory_groupId_itemDefId_key" ON "GroupInventory"("groupId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPrestige_groupId_key" ON "GroupPrestige"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPrestigeTierDef_gameId_name_key" ON "GroupPrestigeTierDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GroupPrestigeTierDef_gameId_tierIndex_key" ON "GroupPrestigeTierDef"("gameId", "tierIndex");

-- CreateIndex
CREATE UNIQUE INDEX "GroupChannel_groupId_name_key" ON "GroupChannel"("groupId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GameShopBreedConfig_gameId_breedId_currencyDefId_key" ON "GameShopBreedConfig"("gameId", "breedId", "currencyDefId");

-- AddForeignKey
ALTER TABLE "GeneticMaterial" ADD CONSTRAINT "GeneticMaterial_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRanking" ADD CONSTRAINT "SeasonRanking_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromGroupId_fkey" FOREIGN KEY ("fromGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toGroupId_fkey" FOREIGN KEY ("toGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStore" ADD CONSTRAINT "PlayerStore_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerStore" ADD CONSTRAINT "PlayerStore_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_playerStoreId_fkey" FOREIGN KEY ("playerStoreId") REFERENCES "PlayerStore"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_hostGroupId_fkey" FOREIGN KEY ("hostGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_foundedByPlayerId_fkey" FOREIGN KEY ("foundedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Group" ADD CONSTRAINT "Group_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupRoleId_fkey" FOREIGN KEY ("groupRoleId") REFERENCES "GroupRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_invitedByPlayerId_fkey" FOREIGN KEY ("invitedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupMember" ADD CONSTRAINT "GroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRole" ADD CONSTRAINT "GroupRole_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRolePermission" ADD CONSTRAINT "GroupRolePermission_groupRoleId_fkey" FOREIGN KEY ("groupRoleId") REFERENCES "GroupRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnimal" ADD CONSTRAINT "GroupAnimal_addedByPlayerId_fkey" FOREIGN KEY ("addedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnimal" ADD CONSTRAINT "GroupAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnimal" ADD CONSTRAINT "GroupAnimal_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnimalSpendingRule" ADD CONSTRAINT "GroupAnimalSpendingRule_groupRoleId_fkey" FOREIGN KEY ("groupRoleId") REFERENCES "GroupRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupAnimalSpendingRule" ADD CONSTRAINT "GroupAnimalSpendingRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSaleProtectionRule" ADD CONSTRAINT "GroupSaleProtectionRule_requiredApprovalRoleId_fkey" FOREIGN KEY ("requiredApprovalRoleId") REFERENCES "GroupRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSaleProtectionRule" ADD CONSTRAINT "GroupSaleProtectionRule_conditionStatDefId_fkey" FOREIGN KEY ("conditionStatDefId") REFERENCES "StatDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSaleProtectionRule" ADD CONSTRAINT "GroupSaleProtectionRule_conditionBreedId_fkey" FOREIGN KEY ("conditionBreedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupSaleProtectionRule" ADD CONSTRAINT "GroupSaleProtectionRule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_geneticPanelDefId_fkey" FOREIGN KEY ("geneticPanelDefId") REFERENCES "GeneticPanelDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_healthConditionDefId_fkey" FOREIGN KEY ("healthConditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupEntryRequirement" ADD CONSTRAINT "GroupEntryRequirement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupFinance" ADD CONSTRAINT "GroupFinance_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupFinance" ADD CONSTRAINT "GroupFinance_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInventory" ADD CONSTRAINT "GroupInventory_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupInventory" ADD CONSTRAINT "GroupInventory_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPrestige" ADD CONSTRAINT "GroupPrestige_tierDefId_fkey" FOREIGN KEY ("tierDefId") REFERENCES "GroupPrestigeTierDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPrestige" ADD CONSTRAINT "GroupPrestige_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPrestigeTierDef" ADD CONSTRAINT "GroupPrestigeTierDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupPrestigeLog" ADD CONSTRAINT "GroupPrestigeLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_requiredRoleId_fkey" FOREIGN KEY ("requiredRoleId") REFERENCES "GroupRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupChannel" ADD CONSTRAINT "GroupChannel_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupActivityLog" ADD CONSTRAINT "GroupActivityLog_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupActivityLog" ADD CONSTRAINT "GroupActivityLog_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clinic" ADD CONSTRAINT "Clinic_hostGroupId_fkey" FOREIGN KEY ("hostGroupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
