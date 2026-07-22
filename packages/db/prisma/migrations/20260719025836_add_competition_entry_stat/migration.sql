-- CreateTable
CREATE TABLE "CompetitionEntryStat" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "trainedValue" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CompetitionEntryStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntryStat_entryId_statDefId_key" ON "CompetitionEntryStat"("entryId", "statDefId");

-- AddForeignKey
ALTER TABLE "CompetitionEntryStat" ADD CONSTRAINT "CompetitionEntryStat_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntryStat" ADD CONSTRAINT "CompetitionEntryStat_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
