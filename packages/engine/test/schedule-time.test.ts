import { test } from "node:test"
import assert from "node:assert/strict"

// Where the scheduler's boundaries fall. No database and no clock of its own:
// every function takes the instant to measure from as an argument.
const { zoneOffsetMinutes, nextDailyBoundary, nextIntervalBoundary } =
  await import("../src/schedule/time.ts")

const at = (iso: string) => new Date(iso)

/** What the clock in `timeZone` reads at `instant`, as "YYYY-MM-DD HH:MM". */
function localReading(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).formatToParts(instant)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "??"
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`
}

test("UTC has no offset", () => {
  assert.equal(zoneOffsetMinutes(at("2026-07-01T12:00:00Z"), "UTC"), 0)
})

test("a zone with a half-hour offset is measured in minutes, not rounded hours", () => {
  assert.equal(zoneOffsetMinutes(at("2026-07-01T12:00:00Z"), "Asia/Kolkata"), 330)
})

test("a zone's offset changes with the season", () => {
  assert.equal(zoneOffsetMinutes(at("2026-01-15T12:00:00Z"), "America/New_York"), -300)
  assert.equal(zoneOffsetMinutes(at("2026-07-15T12:00:00Z"), "America/New_York"), -240)
})

test("an unknown time zone fails loudly instead of falling back to local time", () => {
  assert.throws(() => zoneOffsetMinutes(at("2026-07-01T12:00:00Z"), "Mars/Olympus_Mons"), RangeError)
})

test("the next daily boundary is tomorrow's when today's has passed", () => {
  assert.equal(
    nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: 0, minute: 0 }, "UTC").toISOString(),
    "2026-10-07T00:00:00.000Z"
  )
})

test("the next daily boundary is today's when it is still ahead", () => {
  assert.equal(
    nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: 23, minute: 30 }, "UTC").toISOString(),
    "2026-10-06T23:30:00.000Z"
  )
})

test("standing exactly on a boundary returns the next one, not this one", () => {
  // The scheduler asks this immediately after claiming a run, with that run's
  // own scheduled time. Returning the same instant would make the task due
  // again on the very next tick and claim the same slot forever.
  assert.equal(
    nextDailyBoundary(at("2026-10-06T00:00:00Z"), { hour: 0, minute: 0 }, "UTC").toISOString(),
    "2026-10-07T00:00:00.000Z"
  )
})

test("a wall-clock time is resolved in the configured zone, not the server's", () => {
  // Midnight in New York is 05:00Z in winter and 04:00Z in summer. The game
  // decides which clock it runs on; the machine it happens to be hosted on
  // does not get a say.
  assert.equal(
    nextDailyBoundary(at("2026-01-15T12:00:00Z"), { hour: 0, minute: 0 }, "America/New_York").toISOString(),
    "2026-01-16T05:00:00.000Z"
  )
  assert.equal(
    nextDailyBoundary(at("2026-07-15T12:00:00Z"), { hour: 0, minute: 0 }, "America/New_York").toISOString(),
    "2026-07-16T04:00:00.000Z"
  )
})

// The real test. Step a year and a bit of consecutive boundaries and check
// that every single one lands on the configured wall-clock time. A naive
// implementation that adds 24 hours passes for months and then silently sits
// an hour out from the first Sunday in March until November.
for (const [timeZone, time] of [
  ["America/New_York", { hour: 0, minute: 0 }],
  ["Europe/London", { hour: 0, minute: 0 }],
  ["Pacific/Auckland", { hour: 3, minute: 0 }],
  // Lord Howe shifts by thirty minutes rather than an hour, which is where
  // "the offset is a whole number of hours" assumptions come apart.
  ["Australia/Lord_Howe", { hour: 5, minute: 0 }],
  ["Asia/Kolkata", { hour: 1, minute: 45 }],
] as const) {
  test(`every daily boundary for a year lands on the configured time in ${timeZone}`, () => {
    const expected = `${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`
    let cursor = at("2025-12-01T00:00:00Z")
    let previous = cursor

    for (let day = 0; day < 400; day++) {
      cursor = nextDailyBoundary(cursor, time, timeZone)
      assert.ok(cursor.getTime() > previous.getTime(), `boundary ${day} went backwards`)

      const reading = localReading(cursor, timeZone)
      assert.equal(reading.slice(11), expected, `boundary ${day} read ${reading}`)

      // Consecutive boundaries are one calendar day apart in the zone, so a
      // DST change must never skip a day or repeat one.
      const gapHours = (cursor.getTime() - previous.getTime()) / 3_600_000
      if (day > 0) assert.ok(gapHours >= 22.5 && gapHours <= 25.5, `boundary ${day} was ${gapHours}h after the last`)
      previous = cursor
    }
  })
}

test("a scheduled time inside a spring-forward gap still fires exactly once", () => {
  // 02:30 does not exist in New York on 8 March 2026 — the clock jumps from
  // 02:00 straight to 03:00. There is no right answer, only a wrong one:
  // firing twice, or not at all. It resolves to a real instant on that day.
  const before = at("2026-03-07T12:00:00Z")
  const first = nextDailyBoundary(before, { hour: 2, minute: 30 }, "America/New_York")
  const second = nextDailyBoundary(first, { hour: 2, minute: 30 }, "America/New_York")

  assert.ok(first.getTime() > before.getTime())
  assert.ok(second.getTime() > first.getTime())
  assert.equal(localReading(first, "America/New_York").slice(0, 10), "2026-03-08")
  assert.equal(localReading(second, "America/New_York"), "2026-03-09 02:30")
})

test("a scheduled time that happens twice on a fall-back day is not run twice", () => {
  // 01:30 happens twice in New York on 1 November 2026, once on EDT and again
  // on EST an hour later. Only one of them is a boundary.
  const first = nextDailyBoundary(at("2026-10-31T12:00:00Z"), { hour: 1, minute: 30 }, "America/New_York")
  const second = nextDailyBoundary(first, { hour: 1, minute: 30 }, "America/New_York")

  assert.equal(localReading(first, "America/New_York"), "2026-11-01 01:30")
  assert.equal(localReading(second, "America/New_York"), "2026-11-02 01:30")
})

test("an hour is not a valid clock time just because it is a number", () => {
  assert.throws(() => nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: 24, minute: 0 }, "UTC"))
  assert.throws(() => nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: -1, minute: 0 }, "UTC"))
  assert.throws(() => nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: 1, minute: 60 }, "UTC"))
  assert.throws(() => nextDailyBoundary(at("2026-10-06T12:00:00Z"), { hour: 1.5, minute: 0 }, "UTC"))
})

test("an hourly interval lands on the hour, wherever it is asked from", () => {
  assert.equal(nextIntervalBoundary(at("2026-10-06T12:34:56Z"), 60).toISOString(), "2026-10-06T13:00:00.000Z")
  assert.equal(nextIntervalBoundary(at("2026-10-06T12:00:00.001Z"), 60).toISOString(), "2026-10-06T13:00:00.000Z")
})

test("an interval boundary is strictly after, so a run cannot reclaim its own slot", () => {
  assert.equal(nextIntervalBoundary(at("2026-10-06T13:00:00Z"), 60).toISOString(), "2026-10-06T14:00:00.000Z")
})

test("intervals are anchored to the epoch, not to when the server started", () => {
  // Two instances asking at different moments inside the same quarter hour get
  // the same answer, which is what lets them agree on a schedule without
  // coordinating. It is also what makes a competition's advertised closing
  // time true: the countdown and the sweep read the same grid.
  const quarter = "2026-10-06T12:45:00.000Z"
  assert.equal(nextIntervalBoundary(at("2026-10-06T12:30:00.001Z"), 15).toISOString(), quarter)
  assert.equal(nextIntervalBoundary(at("2026-10-06T12:44:59Z"), 15).toISOString(), quarter)
})

test("a daily interval expressed in minutes still lands at midnight UTC", () => {
  assert.equal(nextIntervalBoundary(at("2026-10-06T12:34:56Z"), 1440).toISOString(), "2026-10-07T00:00:00.000Z")
})

test("an interval has to be a whole number of minutes, and at least one", () => {
  assert.throws(() => nextIntervalBoundary(at("2026-10-06T12:00:00Z"), 0))
  assert.throws(() => nextIntervalBoundary(at("2026-10-06T12:00:00Z"), -15))
  assert.throws(() => nextIntervalBoundary(at("2026-10-06T12:00:00Z"), 1.5))
})
