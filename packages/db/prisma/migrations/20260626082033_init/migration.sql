/*
  Warnings:

  - A unique constraint covering the columns `[stripeCustomerId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "CareActionCostType" AS ENUM ('FREE', 'CURRENCY', 'ITEM');

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "disciplineDefId" TEXT,
ADD COLUMN     "subContainerId" TEXT;

-- AlterTable
ALTER TABLE "AnimalDailyLog" ADD COLUMN     "itemDefId" TEXT;

-- AlterTable
ALTER TABLE "PurchaseRecord" ADD COLUMN     "stripePaymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "stripeCustomerId" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "CareActionDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "costType" "CareActionCostType" NOT NULL,
    "currencyAmount" INTEGER,
    "careScoreGain" DOUBLE PRECISION NOT NULL,
    "energyRestore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moodBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "CareActionDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareActionItem" (
    "id" TEXT NOT NULL,
    "careActionDefId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "CareActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareLog" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "careActionDefId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "performedByPlayerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalCareScore" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnimalCareScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LongTermCareActionDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intervalCycles" INTEGER NOT NULL,
    "gracePeriodCycles" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LongTermCareActionDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalLongTermCareRecord" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "longTermCareActionDefId" TEXT NOT NULL,
    "lastPerformedCycle" INTEGER,
    "nextDueCycle" INTEGER NOT NULL,

    CONSTRAINT "AnimalLongTermCareRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalBehaviorEvent" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "careActionDefId" TEXT,
    "cycleNumber" INTEGER NOT NULL,
    "symptomText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalBehaviorEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CareActionDef_gameId_name_key" ON "CareActionDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CareActionItem_careActionDefId_itemDefId_key" ON "CareActionItem"("careActionDefId", "itemDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalCareScore_animalId_key" ON "AnimalCareScore"("animalId");

-- CreateIndex
CREATE UNIQUE INDEX "LongTermCareActionDef_gameId_name_key" ON "LongTermCareActionDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalLongTermCareRecord_animalId_longTermCareActionDefId_key" ON "AnimalLongTermCareRecord"("animalId", "longTermCareActionDefId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeCustomerId_key" ON "User"("stripeCustomerId");

-- AddForeignKey
ALTER TABLE "CareActionDef" ADD CONSTRAINT "CareActionDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareActionItem" ADD CONSTRAINT "CareActionItem_careActionDefId_fkey" FOREIGN KEY ("careActionDefId") REFERENCES "CareActionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLog" ADD CONSTRAINT "CareLog_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLog" ADD CONSTRAINT "CareLog_careActionDefId_fkey" FOREIGN KEY ("careActionDefId") REFERENCES "CareActionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareLog" ADD CONSTRAINT "CareLog_performedByPlayerId_fkey" FOREIGN KEY ("performedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCareScore" ADD CONSTRAINT "AnimalCareScore_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LongTermCareActionDef" ADD CONSTRAINT "LongTermCareActionDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalLongTermCareRecord" ADD CONSTRAINT "AnimalLongTermCareRecord_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalLongTermCareRecord" ADD CONSTRAINT "AnimalLongTermCareRecord_longTermCareActionDefId_fkey" FOREIGN KEY ("longTermCareActionDefId") REFERENCES "LongTermCareActionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBehaviorEvent" ADD CONSTRAINT "AnimalBehaviorEvent_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalBehaviorEvent" ADD CONSTRAINT "AnimalBehaviorEvent_careActionDefId_fkey" FOREIGN KEY ("careActionDefId") REFERENCES "CareActionDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
