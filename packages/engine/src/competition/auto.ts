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
    include: { venue: true },
  })

  for (const vd of venueDisciplines) {
    const openCount = await client.competition.count({
      where: {
        gameId,
        venueId: vd.venueId,
        disciplineDefId: vd.disciplineDefId,
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
          name: `${vd.venue.name}`,
          maxEntries: vd.defaultMaxEntries,
          maxWaitHours: vd.defaultMaxWaitHours,
          status: "OPEN",
          expiresAt: nextHour(),
        },
      })
    }
  }

  return { ran: expired.length }
}