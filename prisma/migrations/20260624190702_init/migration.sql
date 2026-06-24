-- CreateTable
CREATE TABLE "BanRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "bannedByUserId" TEXT NOT NULL,

    CONSTRAINT "BanRecord_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BanRecord" ADD CONSTRAINT "BanRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanRecord" ADD CONSTRAINT "BanRecord_bannedByUserId_fkey" FOREIGN KEY ("bannedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
