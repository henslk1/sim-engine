import { router } from "../trpc.js";
import { gameAdminRouter } from "./admin.game.js";
import { lifeStageAdminRouter } from "./admin.lifestage.js";
import { speciesAdminRouter } from "./admin.species.js";
import { statAdminRouter } from "./admin.stat.js";
import { breedAdminRouter } from "./admin.breed.js";
import { locusAdminRouter } from "./admin.locus.js";
import { expressionAdminRouter } from "./admin.expression.js";
import { panelAdminRouter } from "./admin.panel.js";
import { personalityAdminRouter } from "./admin.personality.js";
import { itemAdminRouter } from "./admin.item.js";
import { careAdminRouter } from "./admin.care.js";
import { healthAdminRouter } from "./admin.health.js";
import { treatmentAdminRouter } from "./admin.treatment.js";
import { healthCertAdminRouter } from "./admin.healthcert.js";
import { trainingAdminRouter } from "./admin.training.js";
import { intensityTierAdminRouter } from "./admin.intensitytier.js";
import { stageActivityAdminRouter } from "./admin.stageactivity.js";

export const adminRouter = router({
  game: gameAdminRouter,
  species: speciesAdminRouter,
  lifestage: lifeStageAdminRouter,
  stat: statAdminRouter,
  breed: breedAdminRouter,
  locus: locusAdminRouter,
  expression: expressionAdminRouter,
  panel: panelAdminRouter,
  personality: personalityAdminRouter,
  item: itemAdminRouter,
  care: careAdminRouter,
  health: healthAdminRouter,
  treatment: treatmentAdminRouter,
  healthCert: healthCertAdminRouter,
  training: trainingAdminRouter,
  intensityTier: intensityTierAdminRouter,
  stageActivity: stageActivityAdminRouter,
})