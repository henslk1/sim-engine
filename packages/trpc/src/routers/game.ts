import { router, publicProcedure } from "../trpc.js"
import { db } from "@sim-engine/db"
import { z } from "zod"
import { NIGHTLY_WARNING_MS, nextBoundaryFor } from "@sim-engine/engine"
import { gameMaintenance } from "../maintenance.js"

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

      const [config, task, activeRun] = await Promise.all([
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
        db.scheduledTaskRun.findFirst({
          where: { gameId, taskType: "NIGHTLY", status: { in: ["PENDING", "RUNNING", "RETRYING"] } },
          orderBy: { scheduledFor: "desc" },
          select: { id: true, status: true, startedAt: true, scheduledFor: true },
        }),
      ])

      if (!config) return null

      const maintenance = gameMaintenance(gameId)
      const now = new Date()

      // The scheduler's own view wins. A run row can sit PENDING for a moment
      // before anything claims it, and blocking gameplay for a nightly that has
      // not started is worse than the second it costs to wait.
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
