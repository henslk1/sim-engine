-- CreateEnum
CREATE TYPE "WarningType" AS ENUM ('VERBAL', 'FORMAL', 'FINAL');

-- CreateTable
CREATE TABLE "StaffPlayerNote" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPlayerNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerWarning" (
    "id" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "issuedByUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "warningType" "WarningType" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDeviceLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDeviceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveOpsEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "configOverrides" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateOf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveOpsEvent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StaffPlayerNote" ADD CONSTRAINT "StaffPlayerNote_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPlayerNote" ADD CONSTRAINT "StaffPlayerNote_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWarning" ADD CONSTRAINT "PlayerWarning_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerWarning" ADD CONSTRAINT "PlayerWarning_issuedByUserId_fkey" FOREIGN KEY ("issuedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDeviceLog" ADD CONSTRAINT "UserDeviceLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveOpsEvent" ADD CONSTRAINT "LiveOpsEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
