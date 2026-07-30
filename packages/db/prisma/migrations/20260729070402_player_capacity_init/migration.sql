-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN     "defaultAnimalSlots" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "defaultSubContainers" INTEGER NOT NULL DEFAULT 0;
