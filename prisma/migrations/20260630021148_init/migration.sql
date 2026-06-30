-- CreateEnum
CREATE TYPE "VenueClimate" AS ENUM ('HOT', 'WARM', 'COLD', 'TEMPERATE');

-- CreateEnum
CREATE TYPE "VenueTerrain" AS ENUM ('FLAT', 'COASTAL', 'HILLY', 'MOUNTAIN');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeasonCategoryType" AS ENUM ('OVERALL', 'PER_BREED', 'PER_DISCIPLINE');

-- CreateEnum
CREATE TYPE "RankSubjectType" AS ENUM ('PLAYER', 'GROUP');

-- CreateTable
CREATE TABLE "DisciplineDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isConformation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "DisciplineDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplineStatWeight" (
    "id" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "statDefId" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DisciplineStatWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreedConformationStandard" (
    "id" TEXT NOT NULL,
    "breedId" TEXT NOT NULL,
    "locusId" TEXT NOT NULL,
    "idealExpressionLabel" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "BreedConformationStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionTierDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tierIndex" INTEGER NOT NULL,
    "minScore" DOUBLE PRECISION,
    "advancementThreshold" DOUBLE PRECISION,

    CONSTRAINT "CompetitionTierDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "climate" "VenueClimate" NOT NULL,
    "terrain" "VenueTerrain" NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenueDiscipline" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,

    CONSTRAINT "VenueDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressionClimateModifier" (
    "id" TEXT NOT NULL,
    "expressionRuleId" TEXT NOT NULL,
    "climate" "VenueClimate" NOT NULL,
    "modifier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExpressionClimateModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpressionTerrainModifier" (
    "id" TEXT NOT NULL,
    "expressionRuleId" TEXT NOT NULL,
    "terrain" "VenueTerrain" NOT NULL,
    "modifier" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExpressionTerrainModifier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizeConfig" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "placement" INTEGER NOT NULL,
    "currencyDefId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "PrizeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonCategory" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryType" "SeasonCategoryType" NOT NULL,
    "breedId" TEXT,
    "disciplineDefId" TEXT,

    CONSTRAINT "SeasonCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "recordType" TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "disciplineDefId" TEXT,
    "breedId" TEXT,
    "statDefId" TEXT,

    CONSTRAINT "RecordDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectoryFilterDef" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "filterKey" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "filterType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,

    CONSTRAINT "DirectoryFilterDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competition" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "seasonId" TEXT,
    "name" TEXT NOT NULL,
    "minEntries" INTEGER NOT NULL,
    "maxWaitHours" INTEGER NOT NULL,
    "status" "CompetitionStatus" NOT NULL,
    "isInvitational" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionEntry" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "playerAccountId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionResult" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "placement" INTEGER,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "CompetitionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalCompetitionTier" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "tierDefId" TEXT NOT NULL,

    CONSTRAINT "AnimalCompetitionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalWeeklyPoints" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "disciplineDefId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "points" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "AnimalWeeklyPoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeasonRanking" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subjectTypeId" "RankSubjectType" NOT NULL,
    "playerAccountId" TEXT,
    "groupId" TEXT,
    "rank" INTEGER NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "SeasonRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordEntry" (
    "id" TEXT NOT NULL,
    "recordDefId" TEXT NOT NULL,
    "playerAccountId" TEXT,
    "animalId" TEXT,
    "groupId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "setAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineDef_gameId_name_key" ON "DisciplineDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplineStatWeight_disciplineDefId_statDefId_key" ON "DisciplineStatWeight"("disciplineDefId", "statDefId");

-- CreateIndex
CREATE UNIQUE INDEX "BreedConformationStandard_breedId_locusId_key" ON "BreedConformationStandard"("breedId", "locusId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionTierDef_disciplineDefId_tierIndex_key" ON "CompetitionTierDef"("disciplineDefId", "tierIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_gameId_name_key" ON "Venue"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "VenueDiscipline_venueId_disciplineDefId_key" ON "VenueDiscipline"("venueId", "disciplineDefId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressionClimateModifier_expressionRuleId_climate_key" ON "ExpressionClimateModifier"("expressionRuleId", "climate");

-- CreateIndex
CREATE UNIQUE INDEX "ExpressionTerrainModifier_expressionRuleId_terrain_key" ON "ExpressionTerrainModifier"("expressionRuleId", "terrain");

-- CreateIndex
CREATE UNIQUE INDEX "PrizeConfig_competitionId_placement_key" ON "PrizeConfig"("competitionId", "placement");

-- CreateIndex
CREATE UNIQUE INDEX "SeasonCategory_seasonId_name_key" ON "SeasonCategory"("seasonId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "RecordDef_gameId_name_key" ON "RecordDef"("gameId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DirectoryFilterDef_gameId_filterKey_key" ON "DirectoryFilterDef"("gameId", "filterKey");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionEntry_competitionId_animalId_key" ON "CompetitionEntry"("competitionId", "animalId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionResult_entryId_key" ON "CompetitionResult"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalCompetitionTier_animalId_disciplineDefId_key" ON "AnimalCompetitionTier"("animalId", "disciplineDefId");

-- CreateIndex
CREATE UNIQUE INDEX "AnimalWeeklyPoints_animalId_disciplineDefId_weekStart_key" ON "AnimalWeeklyPoints"("animalId", "disciplineDefId", "weekStart");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineDef" ADD CONSTRAINT "DisciplineDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineStatWeight" ADD CONSTRAINT "DisciplineStatWeight_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplineStatWeight" ADD CONSTRAINT "DisciplineStatWeight_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedConformationStandard" ADD CONSTRAINT "BreedConformationStandard_locusId_fkey" FOREIGN KEY ("locusId") REFERENCES "Locus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreedConformationStandard" ADD CONSTRAINT "BreedConformationStandard_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTierDef" ADD CONSTRAINT "CompetitionTierDef_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionTierDef" ADD CONSTRAINT "CompetitionTierDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueDiscipline" ADD CONSTRAINT "VenueDiscipline_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenueDiscipline" ADD CONSTRAINT "VenueDiscipline_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionClimateModifier" ADD CONSTRAINT "ExpressionClimateModifier_expressionRuleId_fkey" FOREIGN KEY ("expressionRuleId") REFERENCES "ExpressionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpressionTerrainModifier" ADD CONSTRAINT "ExpressionTerrainModifier_expressionRuleId_fkey" FOREIGN KEY ("expressionRuleId") REFERENCES "ExpressionRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizeConfig" ADD CONSTRAINT "PrizeConfig_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonCategory" ADD CONSTRAINT "SeasonCategory_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonCategory" ADD CONSTRAINT "SeasonCategory_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonCategory" ADD CONSTRAINT "SeasonCategory_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDef" ADD CONSTRAINT "RecordDef_statDefId_fkey" FOREIGN KEY ("statDefId") REFERENCES "StatDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDef" ADD CONSTRAINT "RecordDef_breedId_fkey" FOREIGN KEY ("breedId") REFERENCES "Breed"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDef" ADD CONSTRAINT "RecordDef_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordDef" ADD CONSTRAINT "RecordDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectoryFilterDef" ADD CONSTRAINT "DirectoryFilterDef_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competition" ADD CONSTRAINT "Competition_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionEntry" ADD CONSTRAINT "CompetitionEntry_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionResult" ADD CONSTRAINT "CompetitionResult_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "CompetitionEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCompetitionTier" ADD CONSTRAINT "AnimalCompetitionTier_tierDefId_fkey" FOREIGN KEY ("tierDefId") REFERENCES "CompetitionTierDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCompetitionTier" ADD CONSTRAINT "AnimalCompetitionTier_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalCompetitionTier" ADD CONSTRAINT "AnimalCompetitionTier_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalWeeklyPoints" ADD CONSTRAINT "AnimalWeeklyPoints_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalWeeklyPoints" ADD CONSTRAINT "AnimalWeeklyPoints_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRanking" ADD CONSTRAINT "SeasonRanking_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRanking" ADD CONSTRAINT "SeasonRanking_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "SeasonCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeasonRanking" ADD CONSTRAINT "SeasonRanking_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_playerAccountId_fkey" FOREIGN KEY ("playerAccountId") REFERENCES "PlayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordEntry" ADD CONSTRAINT "RecordEntry_recordDefId_fkey" FOREIGN KEY ("recordDefId") REFERENCES "RecordDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleDef" ADD CONSTRAINT "TitleDef_disciplineDefId_fkey" FOREIGN KEY ("disciplineDefId") REFERENCES "DisciplineDef"("id") ON DELETE SET NULL ON UPDATE CASCADE;
