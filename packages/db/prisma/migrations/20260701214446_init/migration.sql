/*
  Warnings:

  - You are about to drop the `HiredTrainer` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "JobListingType" AS ENUM ('HIRER_POST', 'WORKER_POST');

-- CreateEnum
CREATE TYPE "JobListingStatus" AS ENUM ('OPEN', 'FILLED', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "JobApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JobContractStatus" AS ENUM ('ACTIVE', 'CLOSURE_REQUESTED', 'PENDING_REVIEW', 'COMPLETED', 'SETTLED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "HiredTrainer" DROP CONSTRAINT "HiredTrainer_hiredByPlayerId_fkey";

-- DropForeignKey
ALTER TABLE "HiredTrainer" DROP CONSTRAINT "HiredTrainer_trainerPlayerId_fkey";

-- AlterTable
ALTER TABLE "SupportTicket" ADD COLUMN     "jobContractId" TEXT;

-- DropTable
DROP TABLE "HiredTrainer";

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "postedByPlayerId" TEXT NOT NULL,
    "listingType" "JobListingType" NOT NULL,
    "description" TEXT,
    "maxAnimals" INTEGER,
    "minAnimals" INTEGER,
    "durationDays" INTEGER,
    "maxAgingCycles" INTEGER,
    "ratePerAnimal" DOUBLE PRECISION,
    "currencyDefId" TEXT,
    "status" "JobListingStatus" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permitCare" BOOLEAN NOT NULL DEFAULT false,
    "permitTraining" BOOLEAN NOT NULL DEFAULT false,
    "permitBreeding" BOOLEAN NOT NULL DEFAULT false,
    "permitCompetition" BOOLEAN NOT NULL DEFAULT false,
    "permitAging" BOOLEAN NOT NULL DEFAULT false,
    "resourceBaseItems" BOOLEAN NOT NULL DEFAULT false,
    "resourcePremiumItems" BOOLEAN NOT NULL DEFAULT false,
    "resourceBaseCurrency" BOOLEAN NOT NULL DEFAULT false,
    "resourcePremiumCurrency" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "JobListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobApplication" (
    "id" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "applicantPlayerId" TEXT NOT NULL,
    "proposedRatePerAnimal" DOUBLE PRECISION,
    "currencyDefId" TEXT,
    "message" TEXT,
    "status" "JobApplicationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContract" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "jobApplicationId" TEXT NOT NULL,
    "hirerPlayerId" TEXT NOT NULL,
    "workerPlayerId" TEXT NOT NULL,
    "durationDays" INTEGER,
    "maxAgingCycles" INTEGER,
    "agreedRatePerAnimal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currencyDefId" TEXT,
    "status" "JobContractStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "closureRequestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JobContract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobContractAnimal" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,

    CONSTRAINT "JobContractAnimal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCompletionRecord" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "completionPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCalculatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCompletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRating" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "raterPlayerId" TEXT NOT NULL,
    "rateePlayerId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,

    CONSTRAINT "JobRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobContract_jobApplicationId_key" ON "JobContract"("jobApplicationId");

-- CreateIndex
CREATE UNIQUE INDEX "JobContractAnimal_contractId_animalId_key" ON "JobContractAnimal"("contractId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCompletionRecord_contractId_key" ON "JobCompletionRecord"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "JobRating_contractId_raterPlayerId_key" ON "JobRating"("contractId", "raterPlayerId");

-- AddForeignKey
ALTER TABLE "Escrow" ADD CONSTRAINT "Escrow_jobContractId_fkey" FOREIGN KEY ("jobContractId") REFERENCES "JobContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_postedByPlayerId_fkey" FOREIGN KEY ("postedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobListing" ADD CONSTRAINT "JobListing_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_applicantPlayerId_fkey" FOREIGN KEY ("applicantPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobApplication" ADD CONSTRAINT "JobApplication_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_workerPlayerId_fkey" FOREIGN KEY ("workerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_hirerPlayerId_fkey" FOREIGN KEY ("hirerPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_jobApplicationId_fkey" FOREIGN KEY ("jobApplicationId") REFERENCES "JobApplication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContract" ADD CONSTRAINT "JobContract_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContractAnimal" ADD CONSTRAINT "JobContractAnimal_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobContractAnimal" ADD CONSTRAINT "JobContractAnimal_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "JobContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCompletionRecord" ADD CONSTRAINT "JobCompletionRecord_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "JobContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRating" ADD CONSTRAINT "JobRating_rateePlayerId_fkey" FOREIGN KEY ("rateePlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRating" ADD CONSTRAINT "JobRating_raterPlayerId_fkey" FOREIGN KEY ("raterPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRating" ADD CONSTRAINT "JobRating_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "JobContract"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_jobContractId_fkey" FOREIGN KEY ("jobContractId") REFERENCES "JobContract"("id") ON DELETE SET NULL ON UPDATE CASCADE;
