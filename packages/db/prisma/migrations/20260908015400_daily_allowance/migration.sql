-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'DAILY_ALLOWANCE';

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "dailyAllowanceBase" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "dailyAllowanceSubscriber" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyAllowanceItem" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subscriberOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyAllowanceItem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "DailyAllowanceItem" ADD CONSTRAINT "DailyAllowanceItem_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAllowanceItem" ADD CONSTRAINT "DailyAllowanceItem_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
