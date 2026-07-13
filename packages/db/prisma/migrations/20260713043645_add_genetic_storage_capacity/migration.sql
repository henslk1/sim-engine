-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "geneticStorageCapacity" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PlayerCapacity" ADD COLUMN     "geneticStorageBase" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "geneticStoragePurchased" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "geneticStorageSubscription" INTEGER NOT NULL DEFAULT 0;
