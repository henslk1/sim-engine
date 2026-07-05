import { router } from "../trpc.js";
import { gameAdminRouter } from "./admin.game.js";

export const adminRouter = router({
  game: gameAdminRouter,
})