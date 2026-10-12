-- Shop rotation as a scheduled task.
--
-- The shop was topped back up to `targetStock` by hand from the admin screen
-- and opportunistically after a purchase. This makes it the same shape as the
-- competition sweep: a task on an epoch-anchored interval that clears the
-- unsold stock and generates a fresh set.
--
-- The interval also gives `GameShopBreedConfig.rotationStartsAt` /
-- `rotationEndsAt` something to mean. They have existed unread since the model
-- was written; from here they are the window in which a breed takes part in
-- the rotation at all.

-- AlterEnum
ALTER TYPE "ScheduledTaskType" ADD VALUE 'SHOP_ROTATION';

-- AlterTable
ALTER TABLE "GameConfig" ADD COLUMN "shopRotationMinutes" INTEGER NOT NULL DEFAULT 60;
