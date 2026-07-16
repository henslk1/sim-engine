import { db } from "@sim-engine/db";

type Client = typeof db

export async function applyCareAction(
  client: Client,
  input: {
    animalId: string
    careActionDefId: string
    performedByPlayerId: string | null
    cycleNumber: number
  }
) {
  return client.$transaction(async (tx) => {

    const { animalId, careActionDefId, performedByPlayerId, cycleNumber } = input

    const action = await tx.careActionDef.findUniqueOrThrow({
      where: { id: careActionDefId },
      include: { items: true },
    })

    switch(action.costType) {

      case "FREE":
        break
      
      case "CURRENCY":{

        if (!performedByPlayerId || !action.currencyAmount) {
          throw new Error("CURRENCY care action requires a player and currencyAmount")
        }

        const baseCurrency = await tx.currencyDef.findFirstOrThrow({
          where: { gameId: action.gameId, currencyType: "BASE" },
          select: { id: true },
        })

        const balance = await tx.playerBalance.findUnique({
          where: { playerAccountId_currencyDefId: { playerAccountId: performedByPlayerId, currencyDefId: baseCurrency.id } },
          select: { balance: true },
        })
        if (!balance || balance.balance < action.currencyAmount) {
          throw new Error("Insufficient funds to perform this care action")
        }

        await tx.playerBalance.update({
          where: {
            playerAccountId_currencyDefId: {
              playerAccountId: performedByPlayerId,
              currencyDefId: baseCurrency.id,
            },
          },
          data: { balance: { decrement: action.currencyAmount } },
        })
        
        await tx.transaction.create({
          data: {
            gameId: action.gameId,
            fromPlayerAccountId: performedByPlayerId,
            currencyDefId: baseCurrency.id,
            amount: action.currencyAmount,
            txnType: "CARE_FEE",
          },
        })

        break

      }

      case "ITEM": {

        if (!performedByPlayerId) {
          throw new Error("ITEM care action requires a player")
        }

        for (const item of action.items) {
          const inv = await tx.playerInventory.findUnique({
            where: {
              playerAccountId_itemDefId: {
                playerAccountId: performedByPlayerId,
                itemDefId: item.itemDefId,
              },
            },
            select: { quantity: true },
          })
          if (!inv || inv.quantity < item.quantity) {
            throw new Error("Not enough items in inventory to perform this care action")
          }
          if (inv.quantity <= item.quantity) {
            await tx.playerInventory.delete({
              where: {
                playerAccountId_itemDefId: {
                  playerAccountId: performedByPlayerId,
                  itemDefId: item.itemDefId,
                },
              },
            })
          } else {
            await tx.playerInventory.update({
              where: {
                playerAccountId_itemDefId: {
                  playerAccountId: performedByPlayerId,
                  itemDefId: item.itemDefId,
                },
              },
              data: { quantity: { decrement: item.quantity } },
            })
          }
        }

        break

      }

    }

    const careLog = await tx.careLog.create({
      data: {
        animalId: animalId,
        careActionDefId: careActionDefId,
        cycleNumber: cycleNumber,
        performedByPlayerId: performedByPlayerId,
      },
    })

    /* Increment energy */
    if (action.energyRestore > 0) {
      const energy = await tx.animalEnergy.findUnique({
        where: { animalId: animalId },
      })

      if (energy) {
        await tx.animalEnergy.update({
          where: { animalId: animalId },
          data: { 
            currentEnergy: Math.min(
              energy.currentEnergy + action.energyRestore,
              energy.maxEnergy
            ),
          },
        })
      } else {
        throw new Error(`No energy record for animal ${animalId}`)
      }
    }

    /* Increment mood where applicable */
    if (action.moodBoost > 0) {
      const mood = await tx.animalMood.findUnique({
        where: { animalId: animalId },
      })

      if (mood) {
        await tx.animalMood.update({
          where: { animalId: animalId },
          data: { value: Math.min(mood.value + action.moodBoost, 100) },
        })
      } else {
        await tx.animalMood.create({
          data: {
            animalId: animalId,
            value: Math.min(action.moodBoost, 100),
          },
        })
      }
    }

    const gameConfig = await tx.gameConfig.findFirst({
      where: { gameId: action.gameId },
      select: { careScoreCeiling: true },
    })
    const ceiling = gameConfig?.careScoreCeiling ?? 100
    const currentCareScore = await tx.animalCareScore.findUnique({ where: { animalId } })
    const newCareScore = Math.min((currentCareScore?.score ?? 0) + action.careScoreGain, ceiling)
    await tx.animalCareScore.upsert({
      where: { animalId: animalId },
      create: { animalId: animalId, score: Math.min(action.careScoreGain, ceiling) },
      update: { score: newCareScore },
    })

    return careLog

  })
}
