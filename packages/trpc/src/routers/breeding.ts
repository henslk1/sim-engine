import { router } from "../trpc.js"
import { breedingMaterialRouter } from "./breeding.material.js"
import { breedingPregnancyRouter } from "./breeding.pregnancy.js"
import { breedingCoverRouter } from "./breeding.cover.js"
import { breedingListingRouter } from "./breeding.listing.js"

export const breedingRouter = router({
  material: breedingMaterialRouter,
  pregnancy: breedingPregnancyRouter,
  cover: breedingCoverRouter,
  listing: breedingListingRouter,
})
