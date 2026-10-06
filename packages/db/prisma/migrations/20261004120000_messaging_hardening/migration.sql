-- A broadcast belongs to the global server's configured announcement channel,
-- not to a mutable channel name.
ALTER TABLE "ChatServer" ADD COLUMN "announcementChannelId" TEXT;

UPDATE "ChatServer" AS server
SET "announcementChannelId" = channel."id"
FROM "ChatChannel" AS channel
WHERE channel."serverId" = server."id"
  AND channel."name" = 'announcements';

CREATE UNIQUE INDEX "ChatServer_announcementChannelId_key"
ON "ChatServer"("announcementChannelId");

ALTER TABLE "ChatServer"
ADD CONSTRAINT "ChatServer_announcementChannelId_fkey"
FOREIGN KEY ("announcementChannelId") REFERENCES "ChatChannel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- A game-authored announcement has no login-capable player behind it.
ALTER TABLE "ChatMessage" ALTER COLUMN "authorPlayerId" DROP NOT NULL;
ALTER TABLE "ChatMessage" ADD COLUMN "authorName" TEXT;

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_author_shape_check"
CHECK (
  ("authorPlayerId" IS NOT NULL AND "authorName" IS NULL)
  OR
  ("authorPlayerId" IS NULL AND "authorName" IS NOT NULL)
);

-- Structural invariants shared by every writer, including future jobs and
-- import scripts.
ALTER TABLE "ChatChannel"
ADD CONSTRAINT "ChatChannel_shape_check"
CHECK (
  ("channelType" = 'DM' AND "serverId" IS NULL AND "name" IS NULL)
  OR
  ("channelType" <> 'DM' AND "serverId" IS NOT NULL AND "name" IS NOT NULL)
);

ALTER TABLE "DirectMessage"
ADD CONSTRAINT "DirectMessage_canonical_pair_check"
CHECK ("participantLowId" < "participantHighId");

-- A pin cannot claim that a message from one channel belongs to another.
CREATE UNIQUE INDEX "ChatMessage_channelId_id_key" ON "ChatMessage"("channelId", "id");
ALTER TABLE "PinnedChatMessage" DROP CONSTRAINT "PinnedChatMessage_messageId_fkey";
ALTER TABLE "PinnedChatMessage"
ADD CONSTRAINT "PinnedChatMessage_channelId_messageId_fkey"
FOREIGN KEY ("channelId", "messageId") REFERENCES "ChatMessage"("channelId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma expresses these as individual foreign keys, which proves that each
-- referenced row exists but cannot prove that all of the rows belong to the
-- same game or channel. Database triggers keep those copied identities honest
-- for every writer, including the image-upload work that follows this phase.

CREATE FUNCTION "messaging_validate_chat_server"() RETURNS TRIGGER AS $$
DECLARE
  destination RECORD;
BEGIN
  IF NEW."announcementChannelId" IS NOT NULL THEN
    SELECT "serverId", "gameId" INTO destination
    FROM "ChatChannel" WHERE "id" = NEW."announcementChannelId";
    IF NOT FOUND
       OR destination."serverId" IS DISTINCT FROM NEW."id"
       OR destination."gameId" IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'announcement channel must belong to its chat server and game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ChatServer_validate_announcement_channel"
BEFORE INSERT OR UPDATE OF "announcementChannelId", "gameId" ON "ChatServer"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_chat_server"();

CREATE FUNCTION "messaging_validate_chat_channel"() RETURNS TRIGGER AS $$
DECLARE
  related_game_id TEXT;
BEGIN
  IF NEW."serverId" IS NOT NULL THEN
    SELECT "gameId" INTO related_game_id FROM "ChatServer" WHERE "id" = NEW."serverId";
    IF FOUND AND related_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'chat channel and server must belong to the same game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."createdByPlayerId" IS NOT NULL THEN
    SELECT "gameId" INTO related_game_id FROM "PlayerAccount" WHERE "id" = NEW."createdByPlayerId";
    IF FOUND AND related_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'chat channel creator must belong to the channel game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ChatChannel_validate_game"
BEFORE INSERT OR UPDATE OF "gameId", "serverId", "createdByPlayerId" ON "ChatChannel"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_chat_channel"();

CREATE FUNCTION "messaging_validate_direct_message"() RETURNS TRIGGER AS $$
DECLARE
  channel_row RECORD;
  low_game_id TEXT;
  high_game_id TEXT;
BEGIN
  SELECT "gameId", "channelType" INTO channel_row
  FROM "ChatChannel" WHERE "id" = NEW."chatChannelId";
  SELECT "gameId" INTO low_game_id FROM "PlayerAccount" WHERE "id" = NEW."participantLowId";
  SELECT "gameId" INTO high_game_id FROM "PlayerAccount" WHERE "id" = NEW."participantHighId";
  IF channel_row."gameId" IS DISTINCT FROM NEW."gameId"
     OR channel_row."channelType" IS DISTINCT FROM 'DM'
     OR low_game_id IS DISTINCT FROM NEW."gameId"
     OR high_game_id IS DISTINCT FROM NEW."gameId" THEN
    RAISE EXCEPTION 'direct message channel and participants must belong to the same game'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "DirectMessage_validate_game"
BEFORE INSERT OR UPDATE OF "gameId", "chatChannelId", "participantLowId", "participantHighId"
ON "DirectMessage"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_direct_message"();

CREATE FUNCTION "messaging_validate_chat_message"() RETURNS TRIGGER AS $$
DECLARE
  channel_game_id TEXT;
  player_game_id TEXT;
BEGIN
  SELECT "gameId" INTO channel_game_id FROM "ChatChannel" WHERE "id" = NEW."channelId";
  IF channel_game_id IS DISTINCT FROM NEW."gameId" THEN
    RAISE EXCEPTION 'chat message and channel must belong to the same game'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."authorPlayerId" IS NOT NULL THEN
    SELECT "gameId" INTO player_game_id FROM "PlayerAccount" WHERE "id" = NEW."authorPlayerId";
    IF player_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'chat message author must belong to the message game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."deletedByPlayerId" IS NOT NULL THEN
    SELECT "gameId" INTO player_game_id FROM "PlayerAccount" WHERE "id" = NEW."deletedByPlayerId";
    IF player_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'chat message remover must belong to the message game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "ChatMessage_validate_game"
BEFORE INSERT OR UPDATE OF "gameId", "channelId", "authorPlayerId", "deletedByPlayerId"
ON "ChatMessage"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_chat_message"();

CREATE FUNCTION "messaging_validate_block"() RETURNS TRIGGER AS $$
DECLARE
  blocker_game_id TEXT;
  blocked_game_id TEXT;
BEGIN
  SELECT "gameId" INTO blocker_game_id FROM "PlayerAccount" WHERE "id" = NEW."blockerPlayerId";
  SELECT "gameId" INTO blocked_game_id FROM "PlayerAccount" WHERE "id" = NEW."blockedPlayerId";
  IF NEW."blockerPlayerId" = NEW."blockedPlayerId"
     OR blocker_game_id IS DISTINCT FROM NEW."gameId"
     OR blocked_game_id IS DISTINCT FROM NEW."gameId" THEN
    RAISE EXCEPTION 'blocked players must be distinct accounts in the same game'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BlockedPlayer_validate_game"
BEFORE INSERT OR UPDATE OF "gameId", "blockerPlayerId", "blockedPlayerId"
ON "BlockedPlayer"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_block"();

CREATE FUNCTION "messaging_validate_read_status"() RETURNS TRIGGER AS $$
DECLARE
  player_game_id TEXT;
  channel_game_id TEXT;
  message_channel_id TEXT;
BEGIN
  SELECT "gameId" INTO player_game_id FROM "PlayerAccount" WHERE "id" = NEW."playerAccountId";
  SELECT "gameId" INTO channel_game_id FROM "ChatChannel" WHERE "id" = NEW."chatChannelId";
  IF player_game_id IS DISTINCT FROM channel_game_id THEN
    RAISE EXCEPTION 'read-status player and channel must belong to the same game'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."lastReadMessageId" IS NOT NULL THEN
    SELECT "channelId" INTO message_channel_id FROM "ChatMessage" WHERE "id" = NEW."lastReadMessageId";
    IF message_channel_id IS DISTINCT FROM NEW."chatChannelId" THEN
      RAISE EXCEPTION 'read pointer must reference a message in its channel'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MessageReadStatus_validate_scope"
BEFORE INSERT OR UPDATE OF "playerAccountId", "chatChannelId", "lastReadMessageId"
ON "MessageReadStatus"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_read_status"();

CREATE FUNCTION "messaging_validate_media_asset"() RETURNS TRIGGER AS $$
DECLARE
  player_game_id TEXT;
  channel_game_id TEXT;
BEGIN
  IF NEW."purpose" = 'CHAT_ATTACHMENT'
     AND (NEW."preparedForChannelId" IS NULL OR NEW."uploadedByPlayerId" IS NULL) THEN
    RAISE EXCEPTION 'chat attachments require an uploader and prepared channel'
      USING ERRCODE = '23514';
  END IF;
  IF NEW."uploadedByPlayerId" IS NOT NULL THEN
    SELECT "gameId" INTO player_game_id FROM "PlayerAccount" WHERE "id" = NEW."uploadedByPlayerId";
    IF player_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'media uploader must belong to the asset game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW."preparedForChannelId" IS NOT NULL THEN
    SELECT "gameId" INTO channel_game_id FROM "ChatChannel" WHERE "id" = NEW."preparedForChannelId";
    IF channel_game_id IS DISTINCT FROM NEW."gameId" THEN
      RAISE EXCEPTION 'prepared media channel must belong to the asset game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MediaAsset_validate_scope"
BEFORE INSERT OR UPDATE OF "gameId", "uploadedByPlayerId", "purpose", "preparedForChannelId"
ON "MediaAsset"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_media_asset"();

CREATE FUNCTION "messaging_validate_attachment"() RETURNS TRIGGER AS $$
DECLARE
  asset_row RECORD;
  message_row RECORD;
BEGIN
  SELECT "gameId", "uploadedByPlayerId", "purpose", "preparedForChannelId", "status"
  INTO asset_row FROM "MediaAsset" WHERE "id" = NEW."mediaAssetId";
  SELECT "gameId", "channelId", "authorPlayerId"
  INTO message_row FROM "ChatMessage" WHERE "id" = NEW."messageId";
  IF asset_row."purpose" IS DISTINCT FROM 'CHAT_ATTACHMENT'
     OR asset_row."status" IS DISTINCT FROM 'READY'
     OR asset_row."gameId" IS DISTINCT FROM message_row."gameId"
     OR asset_row."preparedForChannelId" IS DISTINCT FROM message_row."channelId"
     OR asset_row."uploadedByPlayerId" IS DISTINCT FROM message_row."authorPlayerId" THEN
    RAISE EXCEPTION 'message attachment is not ready and authorized for this message'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "MessageAttachment_validate_scope"
BEFORE INSERT OR UPDATE OF "messageId", "mediaAssetId" ON "MessageAttachment"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_attachment"();

CREATE FUNCTION "messaging_validate_pin"() RETURNS TRIGGER AS $$
DECLARE
  channel_game_id TEXT;
  player_game_id TEXT;
BEGIN
  IF NEW."pinnedByPlayerId" IS NOT NULL THEN
    SELECT "gameId" INTO channel_game_id FROM "ChatChannel" WHERE "id" = NEW."channelId";
    SELECT "gameId" INTO player_game_id FROM "PlayerAccount" WHERE "id" = NEW."pinnedByPlayerId";
    IF player_game_id IS DISTINCT FROM channel_game_id THEN
      RAISE EXCEPTION 'pinning player must belong to the channel game'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "PinnedChatMessage_validate_scope"
BEFORE INSERT OR UPDATE OF "channelId", "pinnedByPlayerId" ON "PinnedChatMessage"
FOR EACH ROW EXECUTE FUNCTION "messaging_validate_pin"();
