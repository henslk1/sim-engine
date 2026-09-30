-- DropIndex
DROP INDEX "DirectMessage_gameId_participantHighId_idx";

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "DirectMessage_gameId_participantLowId_lastActivityAt_idx" ON "DirectMessage"("gameId", "participantLowId", "lastActivityAt");

-- CreateIndex
CREATE INDEX "DirectMessage_gameId_participantHighId_lastActivityAt_idx" ON "DirectMessage"("gameId", "participantHighId", "lastActivityAt");
