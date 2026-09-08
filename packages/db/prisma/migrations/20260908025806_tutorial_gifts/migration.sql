-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'TUTORIAL_GRANT';

-- AlterTable
ALTER TABLE "TutorialStepDef" ADD COLUMN     "grantCurrencyAmount" INTEGER,
ADD COLUMN     "grantCurrencyDefId" TEXT;

-- CreateTable
CREATE TABLE "TutorialStepGrant" (
    "id" TEXT NOT NULL,
    "stepDefId" TEXT NOT NULL,
    "itemDefId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "TutorialStepGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TutorialStepGrant_stepDefId_itemDefId_key" ON "TutorialStepGrant"("stepDefId", "itemDefId");

-- AddForeignKey
ALTER TABLE "TutorialStepDef" ADD CONSTRAINT "TutorialStepDef_grantCurrencyDefId_fkey" FOREIGN KEY ("grantCurrencyDefId") REFERENCES "CurrencyDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialStepGrant" ADD CONSTRAINT "TutorialStepGrant_stepDefId_fkey" FOREIGN KEY ("stepDefId") REFERENCES "TutorialStepDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorialStepGrant" ADD CONSTRAINT "TutorialStepGrant_itemDefId_fkey" FOREIGN KEY ("itemDefId") REFERENCES "ItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
