import { router, publicProcedure } from "./trpc.js";
import { adminRouter } from "./routers/admin.js";
import { animalCareRouter } from "./routers/animal.care.js";
import { animalTrainingRouter } from "./routers/animal.training.js";
import { animalCompetitionRouter } from "./routers/animal.competition.js";
import { animalProfileRouter } from "./routers/animal.profile.js";
import { animalAnimalRouter } from "./routers/animal.animal.js";
import { animalGeneticsRouter } from "./routers/animal.genetics.js";
import { playerRouter } from "./routers/player.js";
import { breedingRouter } from "./routers/breeding.js";
import { stageActivityRouter } from "./routers/stageActivity.js";
import { inventoryRouter } from "./routers/inventory.js";
import { vetRouter } from "./routers/vet.js";
import { notificationRouter } from "./routers/notification.js";
import { tutorialRouter } from "./routers/tutorial.js";
import { bugReportRouter } from "./routers/bugReport.js";
import { supportTicketRouter } from "./routers/supportTicket.js";

export const appRouter = router({
  health: publicProcedure.query(() => ({ status: "ok" })),
  admin: adminRouter,
  care: animalCareRouter,
  training: animalTrainingRouter,
  competition: animalCompetitionRouter,
  animalProfile: animalProfileRouter,
  animal: animalAnimalRouter,
  genetics: animalGeneticsRouter,
  player: playerRouter,
  breeding: breedingRouter,
  stageActivity: stageActivityRouter,
  inventory: inventoryRouter,
  vet: vetRouter,
  notification: notificationRouter,
  tutorial: tutorialRouter,
  bugReport: bugReportRouter,
  supportTicket: supportTicketRouter,
})

export type AppRouter = typeof appRouter
