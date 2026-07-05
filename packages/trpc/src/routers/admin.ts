import { router } from "../trpc.js";
import { gameAdminRouter } from "./admin.game.js";
import { lifeStageAdminRouter } from "./admin.lifestage.js";
import { speciesAdminRouter } from "./admin.species.js";
import { statAdminRouter } from "./admin.stat.js";
import { breedAdminRouter } from "./admin.breed.js";

export const adminRouter = router({
  game: gameAdminRouter,
  species: speciesAdminRouter,
  lifestage: lifeStageAdminRouter,
  stat: statAdminRouter,
  breed: breedAdminRouter,
})