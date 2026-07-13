-- CreateEnum
CREATE TYPE "CoverOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "CoverOffer" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "sireId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "CoverOfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoverOffer_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoverOffer" ADD CONSTRAINT "CoverOffer_damId_fkey" FOREIGN KEY ("damId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
