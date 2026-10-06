-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_authorPlayerId_fkey";

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorPlayerId_fkey" FOREIGN KEY ("authorPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
