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

    const action = await tx.careActionDef.findUniqueOrThrow({
      where: { id: input.careActionDefId },
      include: { items: true },
    })

    switch(action.costType) {

      case "FREE":
        break
      
      case "CURRENCY":{ 

        if (!input.performedByPlayerId || !action.currencyAmount) {
          throw new Error("CURRENCY care action requires a player and currencyAmount")
        }

        const baseCurrency = await tx.currencyDef.findFirstOrThrow({
          where: { gameId: action.gameId, currencyType: "BASE" },
          select: { id: true },
        })

        await tx.playerBalance.update({
          where: {
            playerAccountId_currencyDefId: {
              playerAccountId: input.performedByPlayerId,
              currencyDefId: baseCurrency.id,
            },
          },
          data: { balance: { decrement: action.currencyAmount } },
        })
        
        await tx.transaction.create({
          data: {
            gameId: action.gameId,
            fromPlayerAccountId: input.performedByPlayerId,
            currencyDefId: baseCurrency.id,
            amount: action.currencyAmount,
            txnType: "CARE_FEE",
          },
        })

        break

      }

      case "ITEM": {

        if (!input.performedByPlayerId) {
          throw new Error("ITEM care action requires a player")
        }

        for (const item of action.items) {
          await tx.playerInventory.update({
            where: {
              playerAccountId_itemDefId: {
                playerAccountId: input.performedByPlayerId,
                itemDefId: item.itemDefId,
              },
            },
            data: { quantity: { decrement: item.quantity } },
          })
        }

        break

      }

    }

    const careLog = await tx.careLog.create({
      data: {
        animalId: input.animalId,
        careActionDefId: input.careActionDefId,
        cycleNumber: input.cycleNumber,
        performedByPlayerId: input.performedByPlayerId,
      },
    })

    /* Increment energy */
    if (action.energyRestore > 0) {
      const energy = await tx.animalEnergy.findUnique({
        where: { animalId: input.animalId },
      })

      if (energy) {
        await tx.animalEnergy.update({
          where: { animalId: input.animalId },
          data: { 
            currentEnergy: Math.min(
              energy.currentEnergy + action.energyRestore,
              energy.maxEnergy
            ),
          },
        })
      } else {
        await tx.animalEnergy.create({
          data: {
            animalId: input.animalId,
            currentEnergy: Math.min(action.energyRestore, 1),
            maxEnergy: 1,
          },
        })
      }
    }

    /* Increment mood where applicable */
    if (action.moodBoost > 0) {
      const mood = await tx.animalMood.findUnique({
        where: { animalId: input.animalId },
      })

      if (mood) {
        await tx.animalMood.update({
          where: { animalId: input.animalId },
          data: { value: Math.min(mood.value + action.moodBoost, 1) },
        })
      } else {
        await tx.animalMood.create({
          data: {
            animalId: input.animalId,
            value: Math.min(action.moodBoost, 1),
          },
        })
      }
    }

    await tx.animalCareScore.upsert({
      where: { animalId: input.animalId },
      create: { animalId: input.animalId, score: action.careScoreGain },
      update: { score: { increment: action.careScoreGain } },
    })

    return careLog

  })
}
