-- CreateTable
CREATE TABLE "StarterColorOptionGenotype" (
    "id" TEXT NOT NULL,
    "starterColorOptionId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "alleleOneId" TEXT NOT NULL,
    "alleleTwoId" TEXT NOT NULL,

    CONSTRAINT "StarterColorOptionGenotype_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StarterColorOptionGenotype_starterColorOptionId_locusId_key" ON "StarterColorOptionGenotype"("starterColorOptionId", "locusId");

-- AddForeignKey
ALTER TABLE "StarterColorOptionGenotype" ADD CONSTRAINT "StarterColorOptionGenotype_starterColorOptionId_fkey" FOREIGN KEY ("starterColorOptionId") REFERENCES "StarterColorOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterColorOptionGenotype" ADD CONSTRAINT "StarterColorOptionGenotype_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterColorOptionGenotype" ADD CONSTRAINT "StarterColorOptionGenotype_alleleOneId_fkey" FOREIGN KEY ("alleleOneId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StarterColorOptionGenotype" ADD CONSTRAINT "StarterColorOptionGenotype_alleleTwoId_fkey" FOREIGN KEY ("alleleTwoId") REFERENCES "Allele"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
