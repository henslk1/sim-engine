import { router, publicProcedure } from "../trpc.js"
import { readGameMaintenance } from "../maintenance.js"
import { db } from "@sim-engine/db"
import { z } from "zod"
import { NIGHTLY_WARNING_MS, nextBoundaryFor } from "@sim-engine/engine"

/**
 * What the client needs to know about the nightly update.
 *
 * Served as a query on purpose. A socket event is faster but it is also
 * missable — a player who refreshes, reconnects, or opens a second tab during
 * the window has to be able to ask. The database schedule is authoritative and
 * this is the way to read it.
 *
 * The countdown itself is not sent. `nextNightlyAt` is an instant; the client
 * counts down to it locally rather than being told the remaining seconds, so a
 * slow response or a sleeping tab cannot leave a clock running behind.
 */
export const gameRouter = router({
  nightlyState: publicProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ input }) => {
      const { gameId } = input

      const [config, task, activeRun, maintenance] = await Promise.all([
        db.gameConfig.findUnique({
          where: { gameId },
          select: {
            nightlyRunHour: true,
            nightlyRunMinute: true,
            gameTimeZone: true,
            competitionSweepMinutes: true,
            shopRotationMinutes: true,
          },
        }),
        db.scheduledTask.findUnique({
          where: { gameId_taskType: { gameId, taskType: "NIGHTLY" } },
          select: { enabled: true, nextRunAt: true },
        }),
        // Kept for the countdown's sake: the newest run of any kind, which is
        // what `activeRunId` reports while nothing is blocking. It is
        // deliberately *not* what decides whether the game is shut — see below.
        db.scheduledTaskRun.findFirst({
          where: { gameId, taskType: "NIGHTLY", status: { in: ["PENDING", "RUNNING", "RETRYING"] } },
          orderBy: { scheduledFor: "desc" },
          select: { id: true, status: true, startedAt: true, scheduledFor: true },
        }),
        // Whether the game is shut, answered by the same function the server's
        // own guard uses.
        //
        // This used to be derived from the row above, and the two questions are
        // not the same one: "the newest outstanding run" can be a PENDING run
        // for tonight while an *older* one is still RUNNING from a nightly that
        // overran or was reopened. The newest row then said PENDING, this
        // reported IDLE, and the guard went on refusing every mutation — the
        // interface telling a player the game was open while the server told
        // them it was not. One definition, in one place, is the fix.
        readGameMaintenance(gameId),
      ])

      if (!config) return null

      const now = new Date()

      // Read from the run row, not from this process's memory.
      //
      // The in-memory view used to win here, which was right about PENDING and
      // wrong about everything else: a process that never runs a scheduler tick
      // — a web-only server, or any server in the seconds after it starts —
      // has an empty map and reported every game as open, however many nightlies
      // were in progress. `readGameMaintenance` keeps the PENDING policy: a run
      // row exists for a moment before anything claims it, and shutting gameplay
      // for a nightly that has not started is worse than the second it costs to
      // wait.
      const running = maintenance !== null

      // `nextRunAt` is the stored boundary; recomputing is the fallback for a
      // game whose task row has not been created yet.
      const nextNightlyAt =
        task?.enabled === false
          ? null
          : (task?.nextRunAt ?? nextBoundaryFor("NIGHTLY", config, now))

      const warningStartsAt = nextNightlyAt ? new Date(nextNightlyAt.getTime() - NIGHTLY_WARNING_MS) : null
      const isWarning = !running && warningStartsAt !== null && warningStartsAt <= now

      let progress: { completed: number; total: number } | null = null
      let estimatedCompletionAt: Date | null = null

      if (running && maintenance) {
        const groups = await db.nightlyAnimalWork.groupBy({
          by: ["status"],
          where: { runId: maintenance.runId },
          _count: { _all: true },
        })

        let completed = 0
        let total = 0
        for (const row of groups) {
          total += row._count._all
          if (row.status === "COMPLETED") completed += row._count._all
        }

        if (total > 0) {
          progress = { completed, total }

          // Wall-clock rate over the run so far, which is all a progress bar
          // needs. The admin analytics keeps the finer measures.
          const elapsedMs = now.getTime() - maintenance.startedAt.getTime()
          const remaining = total - completed
          if (completed > 0 && elapsedMs > 0 && remaining > 0) {
            const perMs = completed / elapsedMs
            estimatedCompletionAt = new Date(now.getTime() + remaining / perMs)
          }
        }
      }

      return {
        gameId,
        timeZone: config.gameTimeZone,
        status: running ? ("RUNNING" as const) : isWarning ? ("WARNING" as const) : ("IDLE" as const),
        nextNightlyAt,
        warningStartsAt,
        activeRunId: maintenance?.runId ?? activeRun?.id ?? null,
        startedAt: maintenance?.startedAt ?? null,
        progress,
        estimatedCompletionAt,
      }
    }),
})
