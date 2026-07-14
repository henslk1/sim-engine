-- AlterTable
ALTER TABLE "BreedingListing" ADD COLUMN     "pureBredOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "requiredTitleDefId" TEXT,
ADD COLUMN     "title" TEXT;

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "breedingBaseGain" DOUBLE PRECISION NOT NULL DEFAULT 30,
ADD COLUMN     "breedingMinGain" DOUBLE PRECISION NOT NULL DEFAULT 4,
ADD COLUMN     "breedingVarianceFactor" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gestationCareFloor" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
ADD COLUMN     "identicalMultiplesChance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "multiplesBirthCap" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "multiplesChance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "predictorCost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "predictorDailyLimitSubscriber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlayerPredictorUsage" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerPredictorUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPredictorUsage_playerAccountId_gameId_date_key" ON "PlayerPredictorUsage"("playerAccountId", "gameId", "date");

-- AddForeignKey
ALTER TABLE "BreedingListing" ADD CONSTRAINT "BreedingListing_requiredTitleDefId_fkey" FOREIGN KEY ("requiredTitleDefId") REFERENCES "TitleDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPredictorUsage" ADD CONSTRAINT "PlayerPredictorUsage_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPredictorUsage" ADD CONSTRAINT "PlayerPredictorUsage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
