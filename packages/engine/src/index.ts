export { restockShop, shopConfigIsOpen } from "./shop/restock.js"
export { rotateShop } from "./shop/rotate.js"
export type { ShopRotation } from "./shop/rotate.js"
export { pruneAnimalData, pruneAnimalDataTx, deleteAnimalsWithChildren, deleteAnimalsWithChildrenTx } from "./shop/deleteAnimals.js"
export { applyCareAction, applyCareActionTx } from "./care/apply.js"
export { isDailyCareComplete } from "./care/completion.js"
export { applyStageActivity, applyStageActivityTx } from "./stageActivity/apply.js"
export { applyTrainingAction, applyTrainingActionTx } from "./training/apply.js"
export { enterCompetition, enterCompetitionTx } from "./competition/enter.js"
export { runCompetitionTx, RESOLUTION_TX } from "./competition/run.js"
export { checkCompetitions, replenishOpenSet } from "./competition/auto.js"
export {
  enqueueCompetitionResolution,
  configureCompetitionResolver,
  signalCompetitionResolution,
} from "./competition/queue.js"
export { advanceAnimalAging, advanceAnimalAgingTx } from "./animal/aging.js"
export { loadGameAgingCache, genotypeKey, indexHealthRecords } from "./animal/aging-cache.js"
export { markAnimalActive, markAnimalsActive, ANIMAL_ACTIVITY_SOURCES, NON_QUALIFYING } from "./animal/activity.js"
export type { MarkAnimalActiveInput, AnimalActivitySource } from "./animal/activity.js"
export { selectEligibleAnimals, countEligibleAnimals } from "./animal/eligibility.js"
export type { EligibleAnimal } from "./animal/eligibility.js"
export type { GameAgingCache, HealthRecordRow } from "./animal/aging-cache.js"
// `nextDailyBoundary` and `nextIntervalBoundary` are deliberately not exported.
// They take a wall clock or an interval directly, so a caller reaching for one
// has, by definition, got the game's schedule from somewhere other than its
// GameConfig row. `nextBoundaryFor` below is the way in, and
// `schedule-architecture.test.ts` fails the build if this export comes back.
export { zoneOffsetMinutes } from "./schedule/time.js"
export type { WallClock, CalendarDate } from "./schedule/time.js"
export {
  SCHEDULED_TASK_TYPES,
  IMMINENT_BOUNDARY_MS,
  isScheduledType,
  isValidTimeZone,
  validateGameSchedule,
  nextBoundaryFor,
  NIGHTLY_WARNING_MS,
  describeSchedule,
  systemClock,
} from "./schedule/clock.js"
export type { GameSchedule, ScheduledType, Clock } from "./schedule/clock.js"
export { isLeaseLive, isClaimable, materializeTask, planGameRuns } from "./schedule/plan.js"
export type { TaskRow, RunRow, Materialization, GamePlan } from "./schedule/plan.js"
export { runConformationInspection, applyConformationInspection } from "./animal/conformation.js"
export { generateOffspring } from "./breeding/generateOffspring.js"
export { computeCOI } from "./breeding/computeCOI.js"
export type { GenerateOffspringInput, GenerateOffspringResult, OffspringData, ParentData, GameConfigForBreeding, BlendedAlleleFrequency } from "./breeding/generateOffspring.js"
export { computePhenotypeDescription, computePhenotypeCodes, computeCoatFromCodes, computeCoatFromSource } from "./breeding/computePhenotype.js"
export type { ExpressionRuleForPhenotype, CoatCodeSource } from "./breeding/computePhenotype.js"
export { phenotypeLabel } from "./breeding/phenotypeLabel.js"
export { computeBreedingQuality } from "./breeding/computeBreedingQuality.js"
export type { BreedingQualityInput } from "./breeding/computeBreedingQuality.js"
export { generateFromTemplate } from "./animal/generateFromTemplate.js"
export { initialImmunity, sampleBreedPersonality, isValidPersonalityRange } from "./animal/creationValues.js"
export { computeFixedFields } from "./animal/computeFixedFields.js"
export { requireBreedingAllowed } from "./animal/actionGuards.js"
export { loadMaterialInheritanceWeights } from "./breeding/materialWeights.js"
export { weightedSample, canonicalize } from "./shop/restock.js"
