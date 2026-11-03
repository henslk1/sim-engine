import type { inferRouterOutputs } from "@trpc/server"
import type { AppRouter } from "./router.js"
export { appRouter } from "./router.js"
export {
  setGameMaintenance,
  syncGameMaintenance,
  knownGameMaintenance,
  readGameMaintenance,
  lockGameForMaintenance,
  GameplayDrainTimeout,
  lockGameSchedule,
  ScheduleLockTimeout,
  isMaintenanceBlock,
  MAINTENANCE_STATUSES,
  joinGameplay,
  maintenanceLockKey,
  scheduleLockKey,
  enterGameplay,
  enterGameplayForAnimal,
  enterGameplayForPlayer,
  assertParticipantsInGame,
  enterGameplayForPregnancy,
  enterGameplayForListing,
  enterGameplayForCoverOffer,
} from "./maintenance.js"
export type { AppRouter } from "./router.js"
export type RouterOutputs = inferRouterOutputs<AppRouter>