import { router } from "../trpc.js"
import { breedingMaterialRouter } from "./breeding.material.js"
import { breedingPregnancyRouter } from "./breeding.pregnancy.js"

export const breedingRouter = router({
  material: breedingMaterialRouter,
  pregnancy: breedingPregnancyRouter,
})
