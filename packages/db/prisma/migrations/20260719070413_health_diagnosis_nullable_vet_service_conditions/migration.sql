-- AlterTable
ALTER TABLE "AnimalHealthRecord" ALTER COLUMN "diagnosedCycle" DROP NOT NULL,
ALTER COLUMN "diagnosedAt" DROP NOT NULL,
ALTER COLUMN "diagnosedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "VetServiceCondition" (
    "vetServiceDefId" TEXT NOT NULL,
    "conditionDefId" TEXT NOT NULL,

    CONSTRAINT "VetServiceCondition_pkey" PRIMARY KEY ("vetServiceDefId","conditionDefId")
);

-- AddForeignKey
ALTER TABLE "VetServiceCondition" ADD CONSTRAINT "VetServiceCondition_vetServiceDefId_fkey" FOREIGN KEY ("vetServiceDefId") REFERENCES "VetServiceDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VetServiceCondition" ADD CONSTRAINT "VetServiceCondition_conditionDefId_fkey" FOREIGN KEY ("conditionDefId") REFERENCES "HealthConditionDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
