/**
 * When a game's scheduled work is next due.
 *
 * Both kinds of boundary are computed from an absolute grid rather than from
 * "when did we last finish". That is the whole point. A run that fires late,
 * fires twice, or does not fire at all cannot move the grid, so the schedule
 * never drifts, a restart changes nothing, and two server instances arrive at
 * the same answer without talking to each other.
 *
 * No dependency. Zone rules come from the runtime's own ICU data through
 * `Intl`, which ships with Node and is updated with it, rather than from
 * whatever snapshot of tzdata a date library happened to bundle.
 */

export type WallClock = {
  /** 0-23, read off the local clock in the given time zone. */
  hour: number
  /** 0-59. */
  minute: number
}

export type CalendarDate = {
  year: number
  /** 1-12. Not the 0-11 that `Date` uses. */
  month: number
  day: number
}

type ZonedParts = CalendarDate & { hour: number; minute: number; second: number }

const MINUTE_MS = 60_000
const DAY_MS = 86_400_000

// Constructing one of these loads the zone's rules and is comparatively
// expensive; the scheduler asks the same question of the same zones every
// minute, forever.
const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone)
  if (cached) return cached

  // An unrecognised zone throws RangeError right here, on first use, instead
  // of quietly falling back to whatever the host machine's clock is set to.
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  formatters.set(timeZone, formatter)
  return formatter
}

/** What the clock on the wall in `timeZone` reads at `instant`. */
function partsInZone(instant: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    if (!part) throw new Error(`Intl reported no ${type} for time zone ${timeZone}`)
    return Number(part.value)
  }

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    // `hourCycle: "h23"` is supposed to give 0 for midnight, but some ICU
    // builds report 24. Left unhandled that is a full day of error, for the
    // one hour of the day this scheduler is most likely to be asked about.
    hour: read("hour") % 24,
    minute: read("minute"),
    second: read("second"),
  }
}

/**
 * How far `timeZone` is from UTC at `instant`, in minutes. East is positive,
 * so Asia/Kolkata is 330 and America/New_York is -300 or -240.
 */
export function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const local = partsInZone(instant, timeZone)
  // Read the local wall clock back as though it were UTC. The gap between that
  // and the real instant is the offset. Seconds are carried through because a
  // few zones held sub-minute offsets historically.
  const asIfUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
  // The formatter does not report milliseconds, so drop them from the instant
  // too rather than letting them show up as a fractional offset.
  const whole = Math.floor(instant.getTime() / 1000) * 1000
  return (asIfUtc - whole) / MINUTE_MS
}

/**
 * The instant at which the clock in `timeZone` reads this date and time.
 *
 * On the two days a year a zone changes offset this is not a clean question.
 * A local time inside a spring-forward gap never happens, and a local time
 * inside a fall-back repeat happens twice. Both resolve here to a single real
 * instant, which is all the scheduler needs: the work runs once either way.
 */
function wallClockToUtc(date: CalendarDate, time: WallClock, timeZone: string): Date {
  const naive = Date.UTC(date.year, date.month - 1, date.day, time.hour, time.minute)

  // Guess that the offset in force at the naive instant is the one that
  // applies, then check that guess against the answer it produced. On a
  // change day the two disagree, and the second reading is the one measured at
  // an instant at or beside the real answer, so it wins.
  const guessed = zoneOffsetMinutes(new Date(naive), timeZone)
  const utc = naive - guessed * MINUTE_MS
  const corrected = zoneOffsetMinutes(new Date(utc), timeZone)

  return new Date(corrected === guessed ? utc : naive - corrected * MINUTE_MS)
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  // Calendar arithmetic in UTC, where no day is ever 23 or 25 hours long.
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day) + days * DAY_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  }
}

/**
 * The next instant, strictly after `after`, at which the clock in `timeZone`
 * reads `time`.
 *
 * The step is a calendar day, not 24 hours: adding 86,400,000ms across a DST
 * change would land the following run an hour out and keep it there.
 */
export function nextDailyBoundary(after: Date, time: WallClock, timeZone: string): Date {
  if (!Number.isInteger(time.hour) || time.hour < 0 || time.hour > 23) {
    throw new Error(`Scheduled hour must be an integer 0-23, got ${time.hour}`)
  }
  if (!Number.isInteger(time.minute) || time.minute < 0 || time.minute > 59) {
    throw new Error(`Scheduled minute must be an integer 0-59, got ${time.minute}`)
  }

  let date: CalendarDate = partsInZone(after, timeZone)

  // Today's occurrence has usually already passed, so tomorrow's is the normal
  // answer. The loop is only a guard: a zone that shifts across the boundary
  // can leave a candidate sitting exactly on `after`, and "strictly after" is
  // what stops a run claiming the same slot twice.
  for (let attempt = 0; attempt < 4; attempt++) {
    const candidate = wallClockToUtc(date, time, timeZone)
    if (candidate.getTime() > after.getTime()) return candidate
    date = addDays(date, 1)
  }

  throw new Error(`Could not find a boundary after ${after.toISOString()} for ${time.hour}:${time.minute} in ${timeZone}`)
}

/**
 * The next instant, strictly after `after`, on the fixed grid of
 * `intervalMinutes`.
 *
 * The grid is anchored to the Unix epoch, not to the server's start or to the
 * last run, so 60 lands on the hour, 15 on :00/:15/:30/:45, and every instance
 * and every restart agrees on where the lines are. An interval that does not
 * divide a day evenly still produces a stable grid, just one that walks across
 * the clock face.
 */
export function nextIntervalBoundary(after: Date, intervalMinutes: number): Date {
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error(`Interval must be a whole number of minutes, got ${intervalMinutes}`)
  }

  const step = intervalMinutes * MINUTE_MS
  return new Date(Math.floor(after.getTime() / step) * step + step)
}
