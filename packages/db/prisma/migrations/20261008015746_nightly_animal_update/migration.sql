-- CreateTable
CREATE TABLE "AnimalCycleActivity" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "firstInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalCycleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NightlyAnimalWork" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "claimedBy" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NightlyAnimalWork_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledTaskRunSample" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedTotal" INTEGER NOT NULL,
    "succeededTotal" INTEGER NOT NULL,
    "failedTotal" INTEGER NOT NULL,
    "activeWorkers" INTEGER NOT NULL,

    CONSTRAINT "ScheduledTaskRunSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimalCycleActivity_gameId_cycleNumber_idx" ON "AnimalCycleActivity"("gameId", "cycleNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalCycleActivity_animalId_cycleNumber_key" ON "AnimalCycleActivity"("animalId", "cycleNumber");

-- CreateIndex
CREATE INDEX "NightlyAnimalWork_runId_status_idx" ON "NightlyAnimalWork"("runId", "status");

-- CreateIndex
CREATE INDEX "NightlyAnimalWork_status_leaseUntil_idx" ON "NightlyAnimalWork"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "NightlyAnimalWork_runId_animalId_key" ON "NightlyAnimalWork"("runId", "animalId");

-- CreateIndex
CREATE INDEX "ScheduledTaskRunSample_runId_recordedAt_idx" ON "ScheduledTaskRunSample"("runId", "recordedAt");

-- AddForeignKey
ALTER TABLE "AnimalCycleActivity" ADD CONSTRAINT "AnimalCycleActivity_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCycleActivity" ADD CONSTRAINT "AnimalCycleActivity_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightlyAnimalWork" ADD CONSTRAINT "NightlyAnimalWork_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduledTaskRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NightlyAnimalWork" ADD CONSTRAINT "NightlyAnimalWork_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledTaskRunSample" ADD CONSTRAINT "ScheduledTaskRunSample_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ScheduledTaskRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
