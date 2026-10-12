/**
 * Turning the shop's stock over.
 *
 * Restocking and rotating are different things and the shop only had the first.
 * `restockShop` tops each breed back up to `targetStock` — it fills holes, so a
 * horse nobody buys sits on the shelf forever and the only new stock is
 * whatever replaces a sale. Rotating clears what is unsold and generates a
 * fresh set, which is what makes coming back worth it.
 *
 * Deliberately the same shape as the competition sweep: an epoch-anchored
 * interval from `GameConfig`, work the scheduler owns rather than an admin
 * button, and a window per breed for the ones that are only on offer sometimes.
 */

import { db } from "@sim-engine/db"
import { deleteAnimalsWithChildren } from "./deleteAnimals.js"
import { restockShop, shopConfigIsOpen } from "./restock.js"

type Client = typeof db

export type ShopRotation = {
  /** Breed configs that exist for this game. */
  configs: number
  /** Breed configs taking part in this rotation — active and in window. */
  stocking: number
  /** Unsold animals cleared out. */
  removed: number
  /** Animals generated to replace them. */
  created: number
}

/**
 * Clear the unsold stock and generate a new set.
 *
 * Unsold means `isAvailable` — a bought animal belongs to whoever bought it and
 * is never touched here. Its `GameShopAnimal` row is left alone too: the row is
 * the record that this animal came from the shop, and it stops `restockShop`
 * counting the animal towards stock the moment it is marked unavailable, so
 * there is nothing to gain by deleting it and a purchase history to lose.
 *
 * Everything is cleared, including breeds that will be stocked again a moment
 * later. That is the rotation: the same breed, different horses. What a breed's
 * window decides is whether anything is put back.
 */
export async function rotateShop(
  client: Client,
  gameId: string,
  now: Date = new Date()
): Promise<ShopRotation> {
  const configs = await client.gameShopBreedConfig.findMany({
    where: { gameId },
    select: { id: true, isActive: true, rotationStartsAt: true, rotationEndsAt: true },
  })

  if (configs.length === 0) return { configs: 0, stocking: 0, removed: 0, created: 0 }

  const unsold = await client.gameShopAnimal.findMany({
    where: { gameId, isAvailable: true },
    select: { id: true, animalId: true },
  })

  if (unsold.length > 0) {
    // The join rows first: `GameShopAnimal.animalId` points at the animal, so
    // the animal cannot go while a row still references it.
    await client.gameShopAnimal.deleteMany({ where: { id: { in: unsold.map((a) => a.id) } } })
    await deleteAnimalsWithChildren(unsold.map((a) => a.animalId))
  }

  // `restockShop` applies the window itself, so that the opportunistic top-up
  // after a purchase cannot put a breed back on the shelf after its run has
  // ended. Here it has nothing to top up — everything was just cleared — so it
  // generates a full set for each breed that is taking part.
  const created = await restockShop(gameId, undefined, now)

  return {
    configs: configs.length,
    stocking: configs.filter((config) => config.isActive && shopConfigIsOpen(config, now)).length,
    removed: unsold.length,
    created,
  }
}
