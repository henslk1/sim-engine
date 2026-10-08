/**
 * The one place a game's configuration turns into an instant.
 *
 * Every "when does this run next" question in the scheduler comes through
 * `nextBoundaryFor`, and every answer is derived from the game's own
 * `GameConfig` row — never from the server's clock settings, an environment
 * variable, or a cron string. That is the whole point of this module existing
 * separately from the runner: the time zone a game runs on is configuration,
 * and configuration has exactly one home.
 *
 * It stays that way because `schedule-architecture.test.ts` fails the build if
 * anything else under `schedule/` or `apps/server/src/scheduler/` reaches for
 * `new Date()`, `Date.now()`, or SQL's `NOW()`.
 */

import type { ScheduledTaskType } from "@sim-engine/db"
import { nextDailyBoundary, nextIntervalBoundary } from "./time.js"

/**
 * Where the scheduler reads the time.
 *
 * Nothing under `schedule/` or `apps/server/src/scheduler/` constructs a date
 * of its own — they take a `Clock` and ask it. A single decision is always made
 * against a single reading, so a plan cannot be built against one "now" and
 * then written against another a few milliseconds later. Readings are taken
 * again between runs, and when recording what time something finished, because
 * a nightly that takes half an hour must not judge what happens next against
 * an instant from before it started.
 *
 * The point of routing them all through here is that a test can hand the whole
 * scheduler any moment it likes, including the two minutes a year the clocks
 * change.
 */
export type Clock = {
  now(): Date
}

/** The real clock. The one place in the scheduler a date is constructed. */
export const systemClock: Clock = {
  now: () => new Date(),
}

/**
 * The scheduling columns of `GameConfig`, and nothing else.
 *
 * Narrow on purpose: a handler that wants some other game setting has to go
 * and read it, rather than finding it already in hand and quietly coupling the
 * schedule to it.
 */
export type GameSchedule = {
  /** 0-23, on the clock in `gameTimeZone`. */
  nightlyRunHour: number
  /** 0-59. */
  nightlyRunMinute: number
  /** An IANA zone name, e.g. "America/Chicago". Decides what midnight means. */
  gameTimeZone: string
  /** How often the competition sweep runs, in whole minutes. */
  competitionSweepMinutes: number
}

/**
 * How close a boundary has to be before it counts as already happening.
 *
 * Editing a game's settings moves each task onto the boundary the new settings
 * imply — but a boundary inside this window is left alone and allowed to fire
 * on the old settings first. Saving a config change thirty seconds before
 * midnight should not cost the game a night's aging, and nothing about the act
 * of editing a form says "and skip the run that was about to happen".
 *
 * One tick interval, because that is how long the scheduler can take to notice
 * a boundary at all: anything nearer than this is a run the tick is already on
 * its way to materializing. The new settings take effect from the run after,
 * because the tick computes the following boundary from whatever the config
 * says at that point.
 */
export const IMMINENT_BOUNDARY_MS = 60_000

/**
 * The task types a `ScheduledTask` row is actually created for.
 *
 * `VENUE_ROTATION` exists in the enum but is deliberately absent: rotation is
 * an invitationals mechanism and invitationals are not a built feature, so
 * there is nothing to run. Adding it here is a one-line change on the day
 * there is.
 */
export const SCHEDULED_TASK_TYPES = ["NIGHTLY", "COMPETITION_SWEEP"] as const

export type ScheduledType = (typeof SCHEDULED_TASK_TYPES)[number]

/** Narrowing guard, for reading a task type back out of the database. */
export function isScheduledType(taskType: ScheduledTaskType): taskType is ScheduledType {
  return (SCHEDULED_TASK_TYPES as readonly ScheduledTaskType[]).includes(taskType)
}

/**
 * Whether the runtime recognises this zone.
 *
 * The admin form asks before writing; the scheduler asks before a bad value can
 * stop a game's nightly. Both get the same answer from the same function.
 */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone })
    return true
  } catch {
    return false
  }
}

/**
 * Check a game's schedule, returning every problem rather than the first.
 *
 * Returns an empty array when the schedule is usable. The caller decides
 * whether that is a validation error to show someone or a reason to skip a
 * game for the night.
 */
export function validateGameSchedule(schedule: GameSchedule): string[] {
  const problems: string[] = []

  if (!Number.isInteger(schedule.nightlyRunHour) || schedule.nightlyRunHour < 0 || schedule.nightlyRunHour > 23) {
    problems.push(`nightlyRunHour must be a whole number from 0 to 23, got ${schedule.nightlyRunHour}`)
  }
  if (!Number.isInteger(schedule.nightlyRunMinute) || schedule.nightlyRunMinute < 0 || schedule.nightlyRunMinute > 59) {
    problems.push(`nightlyRunMinute must be a whole number from 0 to 59, got ${schedule.nightlyRunMinute}`)
  }
  if (!isValidTimeZone(schedule.gameTimeZone)) {
    problems.push(`gameTimeZone "${schedule.gameTimeZone}" is not a time zone this runtime knows`)
  }
  if (!Number.isInteger(schedule.competitionSweepMinutes) || schedule.competitionSweepMinutes < 1) {
    problems.push(`competitionSweepMinutes must be a whole number of minutes, at least 1, got ${schedule.competitionSweepMinutes}`)
  }

  return problems
}

/**
 * When `taskType` next falls due for a game on this schedule, strictly after
 * `after`.
 *
 * The two types are genuinely different shapes and this is where that lives:
 * the nightly is a wall-clock time in a zone, so it has to survive a day that
 * is 23 or 25 hours long; the sweep is a fixed grid, so it only has to stay
 * anchored. Collapsing them into one "every N minutes" column would mean the
 * nightly drifting an hour off its configured time for eight months of the
 * year. See `time.ts` for how each is computed.
 */
export function nextBoundaryFor(taskType: ScheduledType, schedule: GameSchedule, after: Date): Date {
  switch (taskType) {
    case "NIGHTLY":
      return nextDailyBoundary(
        after,
        { hour: schedule.nightlyRunHour, minute: schedule.nightlyRunMinute },
        schedule.gameTimeZone
      )
    case "COMPETITION_SWEEP":
      return nextIntervalBoundary(after, schedule.competitionSweepMinutes)
    default: {
      // Adding a value to `SCHEDULED_TASK_TYPES` without giving it a timing
      // rule fails to compile here. A nullable `intervalMinutes` column would
      // instead have produced a task that silently never ran.
      const unhandled: never = taskType
      throw new Error(`No schedule is defined for task type ${String(unhandled)}`)
    }
  }
}

/** One line for a log or the admin screen, in the game's own terms. */
export function describeSchedule(taskType: ScheduledType, schedule: GameSchedule): string {
  switch (taskType) {
    case "NIGHTLY": {
      const hh = String(schedule.nightlyRunHour).padStart(2, "0")
      const mm = String(schedule.nightlyRunMinute).padStart(2, "0")
      return `daily at ${hh}:${mm} ${schedule.gameTimeZone}`
    }
    case "COMPETITION_SWEEP": {
      const minutes = schedule.competitionSweepMinutes
      if (minutes === 60) return "hourly, on the hour"
      if (minutes % 60 === 0) return `every ${minutes / 60} hours`
      return `every ${minutes} minutes`
    }
    default: {
      const unhandled: never = taskType
      throw new Error(`No description is defined for task type ${String(unhandled)}`)
    }
  }
}
