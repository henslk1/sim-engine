/*
  Warnings:

  - You are about to drop the column `dailyAllowanceBase` on the `GameConfig` table. All the data in the column will be lost.
  - You are about to drop the column `dailyAllowanceSubscriber` on the `GameConfig` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "GameConfig" DROP COLUMN "dailyAllowanceBase",
DROP COLUMN "dailyAllowanceSubscriber";

-- CreateTable
CREATE TABLE "DailyAllowanceCurrency" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "subscriberOnly" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DailyAllowanceCurrency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyAllowanceCurrency_gameId_currencyDefId_subscriberOnly_key" ON "DailyAllowanceCurrency"("gameId", "currencyDefId", "subscriberOnly");

-- AddForeignKey
ALTER TABLE "DailyAllowanceCurrency" ADD CONSTRAINT "DailyAllowanceCurrency_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyAllowanceCurrency" ADD CONSTRAINT "DailyAllowanceCurrency_currencyDefId_fkey" FOREIGN KEY ("currencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
