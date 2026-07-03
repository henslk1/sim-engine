-- CreateEnum
CREATE TYPE "BreedProposalStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'IN_VOTE', 'SELECTED');

-- CreateEnum
CREATE TYPE "BreedCampaignStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CampaignPhaseType" AS ENUM ('ANNOUNCEMENT', 'FOUNDATION', 'PROVING', 'GROWTH', 'RECOGNITION');

-- CreateEnum
CREATE TYPE "PhaseTriggerType" AS ENUM ('TIME', 'ADMIN_MANUAL');

-- CreateEnum
CREATE TYPE "AnimalStatMode" AS ENUM ('BREED_MAX', 'FLOOR', 'EXACT');

-- CreateEnum
CREATE TYPE "PersonalityMode" AS ENUM ('RANDOM', 'RANGE');

-- CreateEnum
CREATE TYPE "CampaignRewardStatus" AS ENUM ('PENDING', 'DISTRIBUTED');

-- AlterTable
ALTER TABLE "BreedingListing" ALTER COLUMN "maxSlots" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "campaignPhaseDefId" TEXT;

-- CreateTable
CREATE TABLE "BreedProposal" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "proposingPlayerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lore" TEXT,
    "ancestry" TEXT,
    "geneticPool" TEXT,
    "breedStandard" TEXT,
    "status" "BreedProposalStatus" NOT NULL,
    "adminFeedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "votingStartedAt" TIMESTAMP(3),
    "selectedAt" TIMESTAMP(3),

    CONSTRAINT "BreedProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedProposalVote" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "voterPlayerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreedProposalVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedCampaign" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "proposalId" TEXT,
    "currentPhaseId" TEXT,
    "status" "BreedCampaignStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BreedCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignPhaseDef" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lore" TEXT,
    "phaseType" "CampaignPhaseType" NOT NULL,
    "triggerConditionType" "PhaseTriggerType" NOT NULL,
    "phaseIndex" INTEGER NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),

    CONSTRAINT "CampaignPhaseDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignContribution" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "phaseDefId" TEXT NOT NULL,
    "contributorPlayerId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "conformationScore" DOUBLE PRECISION NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignContribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundationAnimal" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoundationAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTemplate" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "statMode" "AnimalStatMode" NOT NULL,
    "statFloor" DOUBLE PRECISION,
    "healthClear" BOOLEAN NOT NULL DEFAULT false,
    "personalityMode" "PersonalityMode" NOT NULL,
    "personalityMin" DOUBLE PRECISION,
    "personalityMax" DOUBLE PRECISION,
    "alleleQualityBias" DOUBLE PRECISION,

    CONSTRAINT "AnimalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalTemplateGenotype" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "alleleOneId" TEXT NOT NULL,
    "alleleTwoId" TEXT NOT NULL,

    CONSTRAINT "AnimalTemplateGenotype_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRewardTier" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "tierIndex" INTEGER NOT NULL,
    "minRank" INTEGER NOT NULL,
    "maxRank" INTEGER,
    "animalTemplateId" TEXT,
    "breedingSlotsAwarded" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CampaignRewardTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRewardTierCurrency" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "CampaignRewardTierCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRewardTierItem" (
    "id" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "CampaignRewardTierItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRewardRecord" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "recipientPlayerId" TEXT NOT NULL,
    "status" "CampaignRewardStatus" NOT NULL DEFAULT 'PENDING',
    "distributedAt" TIMESTAMP(3),

    CONSTRAINT "CampaignRewardRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedDqTrait" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,

    CONSTRAINT "BreedDqTrait_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BreedProposalVote_proposalId_voterPlayerId_key" ON "BreedProposalVote"("proposalId", "voterPlayerId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedCampaign_breedId_key" ON "BreedCampaign"("breedId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedCampaign_proposalId_key" ON "BreedCampaign"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedCampaign_currentPhaseId_key" ON "BreedCampaign"("currentPhaseId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPhaseDef_campaignId_phaseIndex_key" ON "CampaignPhaseDef"("campaignId", "phaseIndex");

-- CreateIndex
CREATE UNIQUE INDEX "FoundationAnimal_campaignId_animalId_key" ON "FoundationAnimal"("campaignId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalTemplateGenotype_templateId_locusId_key" ON "AnimalTemplateGenotype"("templateId", "locusId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRewardTierCurrency_tierId_currencyDefId_key" ON "CampaignRewardTierCurrency"("tierId", "currencyDefId");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRewardTierItem_tierId_itemDefId_key" ON "CampaignRewardTierItem"("tierId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedDqTrait_breedId_locusId_expression_key" ON "BreedDqTrait"("breedId", "locusId", "expression");

-- AddForeignKey
ALTER TABLE "BreedProposal" ADD CONSTRAINT "BreedProposal_proposingPlayerId_fkey" FOREIGN KEY ("proposingPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedProposal" ADD CONSTRAINT "BreedProposal_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedProposalVote" ADD CONSTRAINT "BreedProposalVote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "BreedProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedProposalVote" ADD CONSTRAINT "BreedProposalVote_voterPlayerId_fkey" FOREIGN KEY ("voterPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedCampaign" ADD CONSTRAINT "BreedCampaign_currentPhaseId_fkey" FOREIGN KEY ("currentPhaseId") REFERENCES "CampaignPhaseDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedCampaign" ADD CONSTRAINT "BreedCampaign_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "BreedProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedCampaign" ADD CONSTRAINT "BreedCampaign_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedCampaign" ADD CONSTRAINT "BreedCampaign_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPhaseDef" ADD CONSTRAINT "CampaignPhaseDef_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BreedCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_contributorPlayerId_fkey" FOREIGN KEY ("contributorPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_phaseDefId_fkey" FOREIGN KEY ("phaseDefId") REFERENCES "CampaignPhaseDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignContribution" ADD CONSTRAINT "CampaignContribution_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BreedCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundationAnimal" ADD CONSTRAINT "FoundationAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundationAnimal" ADD CONSTRAINT "FoundationAnimal_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundationAnimal" ADD CONSTRAINT "FoundationAnimal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BreedCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplate" ADD CONSTRAINT "AnimalTemplate_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplate" ADD CONSTRAINT "AnimalTemplate_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateGenotype" ADD CONSTRAINT "AnimalTemplateGenotype_alleleTwoId_fkey" FOREIGN KEY ("alleleTwoId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateGenotype" ADD CONSTRAINT "AnimalTemplateGenotype_alleleOneId_fkey" FOREIGN KEY ("alleleOneId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateGenotype" ADD CONSTRAINT "AnimalTemplateGenotype_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalTemplateGenotype" ADD CONSTRAINT "AnimalTemplateGenotype_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "AnimalTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTier" ADD CONSTRAINT "CampaignRewardTier_animalTemplateId_fkey" FOREIGN KEY ("animalTemplateId") REFERENCES "AnimalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTier" ADD CONSTRAINT "CampaignRewardTier_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BreedCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTierCurrency" ADD CONSTRAINT "CampaignRewardTierCurrency_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTierCurrency" ADD CONSTRAINT "CampaignRewardTierCurrency_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CampaignRewardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTierItem" ADD CONSTRAINT "CampaignRewardTierItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardTierItem" ADD CONSTRAINT "CampaignRewardTierItem_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CampaignRewardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardRecord" ADD CONSTRAINT "CampaignRewardRecord_recipientPlayerId_fkey" FOREIGN KEY ("recipientPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardRecord" ADD CONSTRAINT "CampaignRewardRecord_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "CampaignRewardTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRewardRecord" ADD CONSTRAINT "CampaignRewardRecord_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "BreedCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedDqTrait" ADD CONSTRAINT "BreedDqTrait_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedDqTrait" ADD CONSTRAINT "BreedDqTrait_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_campaignPhaseDefId_fkey" FOREIGN KEY ("campaignPhaseDefId") REFERENCES "CampaignPhaseDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
