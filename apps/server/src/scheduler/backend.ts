/**
 * Whether this process runs the scheduler.
 *
 *   database  the ScheduledTask tick in runner.ts
 *   none      a web process that serves requests and schedules nothing
 *
 * It defaults to `database`. There was a third value, `bullmq`, while the two
 * schedulers existed side by side; it is gone along with the queues, and a
 * server still carrying `SCHEDULER_BACKEND=bullmq` in its environment is told
 * so rather than quietly falling back to something that merely looks similar.
 */

export const SCHEDULER_BACKENDS = ["database", "none"] as const

export type SchedulerBackend = (typeof SCHEDULER_BACKENDS)[number]

export function resolveSchedulerBackend(raw: string | undefined): SchedulerBackend {
  const value = (raw ?? "database").trim().toLowerCase()

  if (value === "bullmq") {
    throw new Error(
      "SCHEDULER_BACKEND=bullmq is no longer a backend - the queues and workers have been removed. " +
        `Use one of ${SCHEDULER_BACKENDS.join(", ")}, or unset it to get the default.`
    )
  }

  // A typo must stop the process, not quietly pick a default. "datbase" falling
  // back to the default would look exactly like a server that was configured.
  if (!(SCHEDULER_BACKENDS as readonly string[]).includes(value)) {
    throw new Error(
      `SCHEDULER_BACKEND must be one of ${SCHEDULER_BACKENDS.join(", ")} - got "${raw}"`
    )
  }

  return value as SchedulerBackend
}
