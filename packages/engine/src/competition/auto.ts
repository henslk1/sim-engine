import { db } from "@sim-engine/db";
import { runCompetition } from "./run.js";

type Client = typeof db

function nextHour(): Date {
  return new Date(Math.floor(Date.now() / 3_600_000 + 1) * 3_600_000)
}

export async function checkCompetitions(client: Client, gameId: string) {
  const now = new Date()

  const expired = await client.competition.findMany({
    where: { gameId, status: "OPEN", expiresAt: { lte: now } },
    select: { id: true },
  })

  for (const c of expired) {
    await runCompetition(client, { competitionId: c.id })
  }

  const venueDisciplines = await client.venueDiscipline.findMany({
    where: { venue: { gameId } },
    include: { venue: true, disciplineDef: { select: { isConformation: true } } },
  })

  const breeds = await client.breed.findMany({
    where: { gameId },
    select: { id: true, name: true },
  })

  for (const vd of venueDisciplines) {
    const tiers = await client.competitionTierDef.findMany({
      where: { disciplineDefId: vd.disciplineDefId },
      orderBy: { tierIndex: "asc" },
    })

    if (vd.disciplineDef.isConformation) {
      for (const tier of tiers) {
        for (const breed of breeds) {
          const openCount = await client.competition.count({
            where: {
              gameId,
              venueId: vd.venueId,
              disciplineDefId: vd.disciplineDefId,
              tierDefId: tier.id,
              breedId: breed.id,
              status: "OPEN",
            },
          })

          const toCreate = vd.maxOpenAtOnce - openCount
          for (let i = 0; i < toCreate; i++) {
            await client.competition.create({
              data: {
                gameId,
                venueId: vd.venueId,
                disciplineDefId: vd.disciplineDefId,
                tierDefId: tier.id,
                breedId: breed.id,
                name: `${vd.venue.name} — ${breed.name} ${tier.name}`,
                maxEntries: vd.defaultMaxEntries,
                maxWaitHours: vd.defaultMaxWaitHours,
                status: "OPEN",
                expiresAt: nextHour(),
              },
            })
          }
        }
      }
    } else {
      for (const tier of tiers) {
        const openCount = await client.competition.count({
          where: {
            gameId,
            venueId: vd.venueId,
            disciplineDefId: vd.disciplineDefId,
            tierDefId: tier.id,
            status: "OPEN",
          },
        })

        const toCreate = vd.maxOpenAtOnce - openCount
        for (let i = 0; i < toCreate; i++) {
          await client.competition.create({
            data: {
              gameId,
              venueId: vd.venueId,
              disciplineDefId: vd.disciplineDefId,
              tierDefId: tier.id,
              name: `${vd.venue.name} — ${tier.name}`,
              maxEntries: vd.defaultMaxEntries,
              maxWaitHours: vd.defaultMaxWaitHours,
              status: "OPEN",
              expiresAt: nextHour(),
            },
          })
        }
      }
    }
  }

  return { ran: expired.length }
}
