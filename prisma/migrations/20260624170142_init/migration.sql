/*
  Warnings:

  - You are about to drop the column `SubscriptionTierId` on the `PlayerSubscription` table. All the data in the column will be lost.
  - Added the required column `subscriptionTierId` to the `PlayerSubscription` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PlayerSubscription" DROP CONSTRAINT "PlayerSubscription_SubscriptionTierId_fkey";

-- AlterTable
ALTER TABLE "PlayerSubscription" DROP COLUMN "SubscriptionTierId",
ADD COLUMN     "subscriptionTierId" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "PlayerSubscription" ADD CONSTRAINT "PlayerSubscription_subscriptionTierId_fkey" FOREIGN KEY ("subscriptionTierId") REFERENCES "SubscriptionTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
