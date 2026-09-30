-- CreateEnum
CREATE TYPE "MediaPurpose" AS ENUM ('CHAT_ATTACHMENT', 'ARTWORK_SOURCE', 'ANIMAL_RENDER', 'AVATAR', 'GROUP_IMAGE');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('R2');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'REJECTED', 'DELETED');

-- CreateEnum
CREATE TYPE "ChatServerType" AS ENUM ('GLOBAL', 'GROUP');

-- AlterEnum
BEGIN;
CREATE TYPE "ChannelType_new" AS ENUM ('TEXT', 'ANNOUNCEMENT', 'DM');
ALTER TABLE "ChatChannel" ALTER COLUMN "channelType" TYPE "ChannelType_new" USING ("channelType"::text::"ChannelType_new");
ALTER TYPE "ChannelType" RENAME TO "ChannelType_old";
ALTER TYPE "ChannelType_new" RENAME TO "ChannelType";
DROP TYPE "public"."ChannelType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_playerOneId_fkey";

-- DropForeignKey
ALTER TABLE "DirectMessage" DROP CONSTRAINT "DirectMessage_playerTwoId_fkey";

-- DropForeignKey
ALTER TABLE "PinnedMessage" DROP CONSTRAINT "PinnedMessage_chatMessageId_fkey";

-- DropForeignKey
ALTER TABLE "PinnedMessage" DROP CONSTRAINT "PinnedMessage_forumThreadId_fkey";

-- DropForeignKey
ALTER TABLE "PinnedMessage" DROP CONSTRAINT "PinnedMessage_pinnedByPlayerId_fkey";

-- DropIndex
DROP INDEX "DirectMessage_playerOneId_playerTwoId_key";

-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN     "defaultCanPost" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "displayOrder" INTEGER,
ADD COLUMN     "serverId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ChatMessage" DROP COLUMN "isDeleted",
ADD COLUMN     "clientMessageId" TEXT NOT NULL,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByPlayerId" TEXT,
ADD COLUMN     "gameId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "DirectMessage" DROP COLUMN "playerOneId",
DROP COLUMN "playerTwoId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "participantHighId" TEXT NOT NULL,
ADD COLUMN     "participantLowId" TEXT NOT NULL;

-- DropTable
DROP TABLE "PinnedMessage";

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "uploadedByPlayerId" TEXT,
    "purpose" "MediaPurpose" NOT NULL,
    "preparedForChannelId" TEXT,
    "provider" "MediaProvider" NOT NULL DEFAULT 'R2',
    "bucket" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT,
    "status" "MediaStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,

    CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatServer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "serverType" "ChatServerType" NOT NULL,
    "groupId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "pinnedByPlayerId" TEXT,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PinnedForumThread" (
    "id" TEXT NOT NULL,
    "forumSectionId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "pinnedByPlayerId" TEXT,
    "displayOrder" INTEGER,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedForumThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_status_expiresAt_idx" ON "MediaAsset"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageAttachment_mediaAssetId_key" ON "MessageAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatServer_groupId_key" ON "ChatServer"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatServer_gameId_scopeKey_key" ON "ChatServer"("gameId", "scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedChatMessage_channelId_messageId_key" ON "PinnedChatMessage"("channelId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "PinnedForumThread_forumSectionId_threadId_key" ON "PinnedForumThread"("forumSectionId", "threadId");

-- CreateIndex
CREATE INDEX "BanRecord_userId_expiresAt_idx" ON "BanRecord"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatChannel_serverId_displayOrder_idx" ON "ChatChannel"("serverId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ChatChannel_serverId_name_key" ON "ChatChannel"("serverId", "name");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_createdAt_id_idx" ON "ChatMessage"("channelId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_authorPlayerId_clientMessageId_key" ON "ChatMessage"("authorPlayerId", "clientMessageId");

-- CreateIndex
CREATE INDEX "DirectMessage_gameId_participantHighId_idx" ON "DirectMessage"("gameId", "participantHighId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectMessage_gameId_participantLowId_participantHighId_key" ON "DirectMessage"("gameId", "participantLowId", "participantHighId");

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_preparedForChannelId_fkey" FOREIGN KEY ("preparedForChannelId") REFERENCES "ChatChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_uploadedByPlayerId_fkey" FOREIGN KEY ("uploadedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAttachment" ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatServer" ADD CONSTRAINT "ChatServer_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatServer" ADD CONSTRAINT "ChatServer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatChannel" ADD CONSTRAINT "ChatChannel_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ChatServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_participantHighId_fkey" FOREIGN KEY ("participantHighId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_participantLowId_fkey" FOREIGN KEY ("participantLowId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_deletedByPlayerId_fkey" FOREIGN KEY ("deletedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedChatMessage" ADD CONSTRAINT "PinnedChatMessage_pinnedByPlayerId_fkey" FOREIGN KEY ("pinnedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedChatMessage" ADD CONSTRAINT "PinnedChatMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedChatMessage" ADD CONSTRAINT "PinnedChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedForumThread" ADD CONSTRAINT "PinnedForumThread_pinnedByPlayerId_fkey" FOREIGN KEY ("pinnedByPlayerId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedForumThread" ADD CONSTRAINT "PinnedForumThread_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ForumThread"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedForumThread" ADD CONSTRAINT "PinnedForumThread_forumSectionId_fkey" FOREIGN KEY ("forumSectionId") REFERENCES "ForumSection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
