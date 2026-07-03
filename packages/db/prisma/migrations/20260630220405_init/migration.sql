-- CreateEnum
CREATE TYPE "CurrencyType" AS ENUM ('BASE', 'PREMIUM', 'PRESTIGE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'PRIZE', 'BREEDING_FEE', 'COMPETITION_ENTRY', 'MARKETPLACE_SALE', 'MARKETPLACE_PURCHASE', 'STORE_PURCHASE', 'CARE_FEE', 'VET_SERVICE_FEE', 'ESCROW_HOLD', 'ESCROW_RELEASE', 'ESCROW_REFUND', 'CURRENCY_EXCHANGE', 'RAFFLE_TICKET', 'GIFT', 'SUBSCRIPTION', 'ADMIN_ADJUSTMENT', 'GROUP_CONTRIBUTION', 'GROUP_TREASURY_PAYOUT', 'GROUP_CARE_CHARGE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('AGING_BASE', 'AGING_PREMIUM', 'OTC_MEDICATION', 'CARE_CONSUMABLE', 'EQUIPMENT', 'DIRECT_EFFECT', 'PERMANENT_APPLIED', 'ANIMAL_SLOT_EXPAND', 'SUBCONTAINER_EXPAND');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('AGING', 'CARE', 'HEALTH', 'EQUIPMENT', 'BREEDING', 'STORAGE', 'MISC');

-- CreateEnum
CREATE TYPE "PermanentEffectType" AS ENUM ('IMMORTALITY', 'SEX_CHANGE', 'FREE_AGING', 'BREEDING_SLOT_RAISE', 'ENERGY_MAX_RAISE', 'TWIN_CHANCE_RAISE', 'TWIN_GUARANTEE', 'STAGE_SKIP');

-- CreateEnum
CREATE TYPE "ShopType" AS ENUM ('BASE', 'PREMIUM', 'GROUP', 'VET');

-- CreateEnum
CREATE TYPE "VetServiceType" AS ENUM ('EXAM', 'PANEL_TEST', 'GENETIC_COLLECTION', 'GENETIC_STORAGE');

-- CreateEnum
CREATE TYPE "ListingType" AS ENUM ('ANIMAL', 'ITEM', 'GENETIC_MATERIAL');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('HELD', 'RELEASED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "RaffleHostType" AS ENUM ('ADMIN', 'PLAYER', 'GROUP');

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "containerLabel" TEXT,
ADD COLUMN     "subContainerLabel" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionTier" ADD COLUMN     "hasGeneReveal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "VetVisitLog" ADD COLUMN     "vetServiceDefId" TEXT;

-- CreateTable
CREATE TABLE "CurrencyDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyType" "CurrencyType" NOT NULL,
    "symbol" TEXT,

    CONSTRAINT "CurrencyDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerBalance" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,

    CONSTRAINT "PlayerBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "fromPlayerAccountId" TEXT,
    "toPlayerAccountId" TEXT,
    "fromGroupId" TEXT,
    "toGroupId" TEXT,
    "actingPlayerAccountId" TEXT,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "txnType" "TransactionType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "ItemType" NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "effects" JSONB,
    "effectType" "PermanentEffectType",
    "prizeEligible" BOOLEAN NOT NULL DEFAULT true,
    "isSellable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ItemDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerInventory" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlayerInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalAppliedItem" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "appliedByPlayerId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "AnimalAppliedItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerCapacity" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "animalSlotBase" INTEGER NOT NULL,
    "animalSlotSubscription" INTEGER NOT NULL DEFAULT 0,
    "animalSlotPurchased" INTEGER NOT NULL DEFAULT 0,
    "subContainerBase" INTEGER NOT NULL,
    "subContainerSubscription" INTEGER NOT NULL DEFAULT 0,
    "subContainerPurchased" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubContainer" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "sortDefault" TEXT,
    "filterConfig" JSONB,

    CONSTRAINT "SubContainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreListing" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "shopType" "ShopType" NOT NULL,
    "price" INTEGER NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRotating" BOOLEAN NOT NULL DEFAULT false,
    "rotationStartsAt" TIMESTAMP(3),
    "rotationEndsAt" TIMESTAMP(3),

    CONSTRAINT "StoreListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VetServiceDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" "VetServiceType" NOT NULL,
    "baseCost" INTEGER NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "hasSubscriberDiscount" BOOLEAN NOT NULL DEFAULT false,
    "panelDefId" TEXT,

    CONSTRAINT "VetServiceDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceUsd" INTEGER NOT NULL,
    "stripeProductId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleItem" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleCurrencyReward" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "BundleCurrencyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleAnimal" (
    "id" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "BundleAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameShopBreedConfig" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "targetStock" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rotationStartsAt" TIMESTAMP(3),
    "rotationEndsAt" TIMESTAMP(3),

    CONSTRAINT "GameShopBreedConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameShopAnimal" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "shopBreedConfigId" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "purchasedAt" TIMESTAMP(3),

    CONSTRAINT "GameShopAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListing" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sellerPlayerId" TEXT NOT NULL,
    "listingType" "ListingType" NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingAnimal" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,

    CONSTRAINT "MarketplaceListingAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingItem" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "MarketplaceListingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceListingGeneticMaterial" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "geneticMaterialId" TEXT NOT NULL,

    CONSTRAINT "MarketplaceListingGeneticMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOffer" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyingPlayerId" TEXT NOT NULL,
    "amount" INTEGER,
    "currencyDefId" TEXT,
    "status" "OfferStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOfferAnimal" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,

    CONSTRAINT "MarketplaceOfferAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOfferItem" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "MarketplaceOfferItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceOfferGeneticMaterial" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "geneticMaterialId" TEXT NOT NULL,

    CONSTRAINT "MarketplaceOfferGeneticMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyExchangeOrder" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sellerPlayerId" TEXT NOT NULL,
    "fromCurrencyDefId" TEXT NOT NULL,
    "toCurrencyDefId" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL,
    "amountOffered" INTEGER NOT NULL,
    "amountRemaining" INTEGER NOT NULL,
    "isFlagged" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CurrencyExchangeOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escrow" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "fromPlayerId" TEXT NOT NULL,
    "toPlayerId" TEXT,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "EscrowStatus" NOT NULL,
    "jobContractId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Escrow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gift" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "fromPlayerId" TEXT NOT NULL,
    "toPlayerId" TEXT NOT NULL,
    "itemDefId" TEXT,
    "itemQuantity" INTEGER,
    "animalId" TEXT,
    "currencyDefId" TEXT,
    "currencyAmount" INTEGER,
    "geneticMaterialId" TEXT,
    "message" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Raffle" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ticketPrice" INTEGER,
    "currencyDefId" TEXT,
    "maxTickets" INTEGER,
    "ticketsPerPlayer" INTEGER,
    "hostType" "RaffleHostType" NOT NULL,
    "hostPlayerId" TEXT,
    "hostGroupId" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isDrawn" BOOLEAN NOT NULL DEFAULT false,
    "drawnAt" TIMESTAMP(3),

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleEntry" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleItemConfig" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "ticketsPerItem" INTEGER NOT NULL,
    "totalCap" INTEGER,
    "perPlayerCap" INTEGER,

    CONSTRAINT "RaffleItemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleItemSubmission" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "ticketsEarned" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleItemSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrize" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,

    CONSTRAINT "RafflePrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrizeItem" (
    "id" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "RafflePrizeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrizeAnimal" (
    "id" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "animalId" TEXT,
    "breedId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "RafflePrizeAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrizeGeneticMaterial" (
    "id" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "geneticMaterialId" TEXT NOT NULL,

    CONSTRAINT "RafflePrizeGeneticMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrizeCurrency" (
    "id" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "RafflePrizeCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleWinner" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "claimedAt" TIMESTAMP(3),

    CONSTRAINT "RaffleWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CurrencyDef_gameId_name_key" ON "CurrencyDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerBalance_playerAccountId_currencyDefId_key" ON "PlayerBalance"("playerAccountId", "currencyDefId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDef_gameId_name_key" ON "ItemDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInventory_playerAccountId_itemDefId_key" ON "PlayerInventory"("playerAccountId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerCapacity_playerAccountId_key" ON "PlayerCapacity"("playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "VetServiceDef_gameId_name_key" ON "VetServiceDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Bundle_gameId_name_key" ON "Bundle"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "BundleItem_bundleId_itemDefId_key" ON "BundleItem"("bundleId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleCurrencyReward_bundleId_currencyDefId_key" ON "BundleCurrencyReward"("bundleId", "currencyDefId");

-- CreateIndex
CREATE UNIQUE INDEX "BundleAnimal_bundleId_breedId_key" ON "BundleAnimal"("bundleId", "breedId");

-- CreateIndex
CREATE UNIQUE INDEX "GameShopBreedConfig_gameId_breedId_key" ON "GameShopBreedConfig"("gameId", "breedId");

-- CreateIndex
CREATE UNIQUE INDEX "GameShopAnimal_animalId_key" ON "GameShopAnimal"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingAnimal_listingId_animalId_key" ON "MarketplaceListingAnimal"("listingId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingItem_listingId_itemDefId_key" ON "MarketplaceListingItem"("listingId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceListingGeneticMaterial_listingId_geneticMaterial_key" ON "MarketplaceListingGeneticMaterial"("listingId", "geneticMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOfferAnimal_offerId_animalId_key" ON "MarketplaceOfferAnimal"("offerId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOfferItem_offerId_itemDefId_key" ON "MarketplaceOfferItem"("offerId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceOfferGeneticMaterial_offerId_geneticMaterialId_key" ON "MarketplaceOfferGeneticMaterial"("offerId", "geneticMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "Escrow_jobContractId_key" ON "Escrow"("jobContractId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleEntry_raffleId_playerAccountId_key" ON "RaffleEntry"("raffleId", "playerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleItemConfig_raffleId_itemDefId_key" ON "RaffleItemConfig"("raffleId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "RafflePrize_raffleId_placement_key" ON "RafflePrize"("raffleId", "placement");

-- CreateIndex
CREATE UNIQUE INDEX "RafflePrizeItem_rafflePrizeId_itemDefId_key" ON "RafflePrizeItem"("rafflePrizeId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "RafflePrizeGeneticMaterial_rafflePrizeId_geneticMaterialId_key" ON "RafflePrizeGeneticMaterial"("rafflePrizeId", "geneticMaterialId");

-- CreateIndex
CREATE UNIQUE INDEX "RafflePrizeCurrency_rafflePrizeId_currencyDefId_key" ON "RafflePrizeCurrency"("rafflePrizeId", "currencyDefId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleWinner_raffleId_placement_key" ON "RaffleWinner"("raffleId", "placement");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_subContainerId_fkey" FOREIGN KEY ("subContainerId") REFERENCES "SubContainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalDailyLog" ADD CONSTRAINT "AnimalDailyLog_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedingListing" ADD CONSTRAINT "BreedingListing_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareActionItem" ADD CONSTRAINT "CareActionItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyDef" ADD CONSTRAINT "CurrencyDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerBalance" ADD CONSTRAINT "PlayerBalance_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerBalance" ADD CONSTRAINT "PlayerBalance_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toPlayerAccountId_fkey" FOREIGN KEY ("toPlayerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromPlayerAccountId_fkey" FOREIGN KEY ("fromPlayerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_actingPlayerAccountId_fkey" FOREIGN KEY ("actingPlayerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDef" ADD CONSTRAINT "ItemDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInventory" ADD CONSTRAINT "PlayerInventory_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalAppliedItem" ADD CONSTRAINT "AnimalAppliedItem_appliedByPlayerId_fkey" FOREIGN KEY ("appliedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalAppliedItem" ADD CONSTRAINT "AnimalAppliedItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalAppliedItem" ADD CONSTRAINT "AnimalAppliedItem_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCapacity" ADD CONSTRAINT "PlayerCapacity_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubContainer" ADD CONSTRAINT "SubContainer_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreListing" ADD CONSTRAINT "StoreListing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetServiceDef" ADD CONSTRAINT "VetServiceDef_panelDefId_fkey" FOREIGN KEY ("panelDefId") REFERENCES "GeneticPanelDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetServiceDef" ADD CONSTRAINT "VetServiceDef_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetServiceDef" ADD CONSTRAINT "VetServiceDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleItem" ADD CONSTRAINT "BundleItem_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleCurrencyReward" ADD CONSTRAINT "BundleCurrencyReward_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleCurrencyReward" ADD CONSTRAINT "BundleCurrencyReward_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleAnimal" ADD CONSTRAINT "BundleAnimal_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleAnimal" ADD CONSTRAINT "BundleAnimal_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopBreedConfig" ADD CONSTRAINT "GameShopBreedConfig_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopBreedConfig" ADD CONSTRAINT "GameShopBreedConfig_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopBreedConfig" ADD CONSTRAINT "GameShopBreedConfig_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopAnimal" ADD CONSTRAINT "GameShopAnimal_shopBreedConfigId_fkey" FOREIGN KEY ("shopBreedConfigId") REFERENCES "GameShopBreedConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopAnimal" ADD CONSTRAINT "GameShopAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameShopAnimal" ADD CONSTRAINT "GameShopAnimal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_sellerPlayerId_fkey" FOREIGN KEY ("sellerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListing" ADD CONSTRAINT "MarketplaceListing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingAnimal" ADD CONSTRAINT "MarketplaceListingAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingAnimal" ADD CONSTRAINT "MarketplaceListingAnimal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingItem" ADD CONSTRAINT "MarketplaceListingItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingItem" ADD CONSTRAINT "MarketplaceListingItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingGeneticMaterial" ADD CONSTRAINT "MarketplaceListingGeneticMaterial_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceListingGeneticMaterial" ADD CONSTRAINT "MarketplaceListingGeneticMaterial_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_buyingPlayerId_fkey" FOREIGN KEY ("buyingPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOffer" ADD CONSTRAINT "MarketplaceOffer_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "MarketplaceListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferAnimal" ADD CONSTRAINT "MarketplaceOfferAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferAnimal" ADD CONSTRAINT "MarketplaceOfferAnimal_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferItem" ADD CONSTRAINT "MarketplaceOfferItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferItem" ADD CONSTRAINT "MarketplaceOfferItem_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferGeneticMaterial" ADD CONSTRAINT "MarketplaceOfferGeneticMaterial_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceOfferGeneticMaterial" ADD CONSTRAINT "MarketplaceOfferGeneticMaterial_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "MarketplaceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyExchangeOrder" ADD CONSTRAINT "CurrencyExchangeOrder_toCurrencyDefId_fkey" FOREIGN KEY ("toCurrencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyExchangeOrder" ADD CONSTRAINT "CurrencyExchangeOrder_fromCurrencyDefId_fkey" FOREIGN KEY ("fromCurrencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyExchangeOrder" ADD CONSTRAINT "CurrencyExchangeOrder_sellerPlayerId_fkey" FOREIGN KEY ("sellerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyExchangeOrder" ADD CONSTRAINT "CurrencyExchangeOrder_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_toPlayerId_fkey" FOREIGN KEY ("toPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_fromPlayerId_fkey" FOREIGN KEY ("fromPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_toPlayerId_fkey" FOREIGN KEY ("toPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_fromPlayerId_fkey" FOREIGN KEY ("fromPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gift" ADD CONSTRAINT "Gift_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_hostPlayerId_fkey" FOREIGN KEY ("hostPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleItemConfig" ADD CONSTRAINT "RaffleItemConfig_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleItemConfig" ADD CONSTRAINT "RaffleItemConfig_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleItemSubmission" ADD CONSTRAINT "RaffleItemSubmission_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleItemSubmission" ADD CONSTRAINT "RaffleItemSubmission_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleItemSubmission" ADD CONSTRAINT "RaffleItemSubmission_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrize" ADD CONSTRAINT "RafflePrize_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeItem" ADD CONSTRAINT "RafflePrizeItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeItem" ADD CONSTRAINT "RafflePrizeItem_rafflePrizeId_fkey" FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeAnimal" ADD CONSTRAINT "RafflePrizeAnimal_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeAnimal" ADD CONSTRAINT "RafflePrizeAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeAnimal" ADD CONSTRAINT "RafflePrizeAnimal_rafflePrizeId_fkey" FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeGeneticMaterial" ADD CONSTRAINT "RafflePrizeGeneticMaterial_geneticMaterialId_fkey" FOREIGN KEY ("geneticMaterialId") REFERENCES "GeneticMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeGeneticMaterial" ADD CONSTRAINT "RafflePrizeGeneticMaterial_rafflePrizeId_fkey" FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeCurrency" ADD CONSTRAINT "RafflePrizeCurrency_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrizeCurrency" ADD CONSTRAINT "RafflePrizeCurrency_rafflePrizeId_fkey" FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentItem" ADD CONSTRAINT "TreatmentItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetVisitLog" ADD CONSTRAINT "VetVisitLog_vetServiceDefId_fkey" FOREIGN KEY ("vetServiceDefId") REFERENCES "VetServiceDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalEquipment" ADD CONSTRAINT "AnimalEquipment_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
