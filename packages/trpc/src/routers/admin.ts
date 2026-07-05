import { router } from "../trpc.js";
import { gameAdminRouter } from "./admin.game.js";
import { speciesAdminRouter } from "./admin.species.js";

export const adminRouter = router({
  game: gameAdminRouter,
  species: speciesAdminRouter,
})