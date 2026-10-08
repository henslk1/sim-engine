import { test } from "node:test"
import assert from "node:assert/strict"

// The one place a game's configuration becomes an instant. Everything here is
// pure: a schedule goes in, a time comes out, no database and no clock.
const {
  SCHEDULED_TASK_TYPES,
  isScheduledType,
  isValidTimeZone,
  validateGameSchedule,
  nextBoundaryFor,
  describeSchedule,
  systemClock,
} = await import("../src/schedule/clock.ts")

const at = (iso: string) => new Date(iso)

/** A game on Kristin's settings: midnight Central, hourly sweep. */
const central = {
  nightlyRunHour: 0,
  nightlyRunMinute: 0,
  gameTimeZone: "America/Chicago",
  competitionSweepMinutes: 60,
}

test("venue rotation is not a scheduled type", () => {
  // The enum value exists so the column can hold it later, but rotation is an
  // invitationals mechanism and invitationals are not built. Nothing creates a
  // task row for it and nothing runs it, and that is deliberate rather than an
  // oversight for someone to helpfully correct.
  assert.deepEqual([...SCHEDULED_TASK_TYPES], ["NIGHTLY", "COMPETITION_SWEEP"])
  assert.equal(isScheduledType("NIGHTLY"), true)
  assert.equal(isScheduledType("VENUE_ROTATION"), false)
})

test("the nightly is read off the game's clock, not the server's", () => {
  // Midnight Central is 05:00Z while daylight time is in force. The machine
  // this runs on does not get a say — which is the entire reason the column
  // exists, because BullMQ's cron had no time zone and silently used the host.
  assert.equal(
    nextBoundaryFor("NIGHTLY", central, at("2026-10-06T19:50:00Z")).toISOString(),
    "2026-10-07T05:00:00.000Z"
  )
})

test("the nightly holds its wall-clock time across a daylight saving change", () => {
  // 1 November 2026 is when Central goes back to standard time. The configured
  // time is midnight on both sides of it; only the UTC instant moves.
  assert.equal(
    nextBoundaryFor("NIGHTLY", central, at("2026-10-31T12:00:00Z")).toISOString(),
    "2026-11-01T05:00:00.000Z"
  )
  assert.equal(
    nextBoundaryFor("NIGHTLY", central, at("2026-11-01T12:00:00Z")).toISOString(),
    "2026-11-02T06:00:00.000Z"
  )
})

test("changing the configured zone moves the nightly and nothing else", () => {
  const from = at("2026-10-06T19:50:00Z")
  const utc = { ...central, gameTimeZone: "UTC" }

  // The value the live GameConfig row holds today, against the one it should
  // hold. Five hours apart: the whole reason the backfill matters.
  assert.equal(nextBoundaryFor("NIGHTLY", central, from).toISOString(), "2026-10-07T05:00:00.000Z")
  assert.equal(nextBoundaryFor("NIGHTLY", utc, from).toISOString(), "2026-10-07T00:00:00.000Z")

  // The sweep is a fixed grid and has no opinion about zones. If someone ever
  // "fixes" that by making it zone-aware, two instances in different zones
  // stop agreeing on where the hour boundary is.
  assert.equal(
    nextBoundaryFor("COMPETITION_SWEEP", central, from).toISOString(),
    nextBoundaryFor("COMPETITION_SWEEP", utc, from).toISOString()
  )
})

test("the sweep follows its configured interval", () => {
  const from = at("2026-10-06T12:34:56Z")
  assert.equal(nextBoundaryFor("COMPETITION_SWEEP", central, from).toISOString(), "2026-10-06T13:00:00.000Z")
  assert.equal(
    nextBoundaryFor("COMPETITION_SWEEP", { ...central, competitionSweepMinutes: 15 }, from).toISOString(),
    "2026-10-06T12:45:00.000Z"
  )
})

test("a boundary is strictly after the instant it is asked from", () => {
  // Asked immediately after a run is materialized, with that run's own time.
  // Returning the same instant would make the task due again on the next tick,
  // forever.
  assert.equal(
    nextBoundaryFor("NIGHTLY", central, at("2026-10-07T05:00:00Z")).toISOString(),
    "2026-10-08T05:00:00.000Z"
  )
  assert.equal(
    nextBoundaryFor("COMPETITION_SWEEP", central, at("2026-10-06T13:00:00Z")).toISOString(),
    "2026-10-06T14:00:00.000Z"
  )
})

test("a usable schedule reports no problems", () => {
  assert.deepEqual(validateGameSchedule(central), [])
})

test("every bad field is reported, not just the first", () => {
  // The admin form shows these. Fixing one field, saving, and being told about
  // the next one is a bad way to find out there were three.
  const problems = validateGameSchedule({
    nightlyRunHour: 24,
    nightlyRunMinute: -1,
    gameTimeZone: "America/Chicargo",
    competitionSweepMinutes: 0,
  })
  assert.equal(problems.length, 4)
})

test("each field is checked for the thing that actually breaks it", () => {
  assert.deepEqual(validateGameSchedule({ ...central, nightlyRunHour: 23 }), [])
  assert.equal(validateGameSchedule({ ...central, nightlyRunHour: 24 }).length, 1)
  assert.equal(validateGameSchedule({ ...central, nightlyRunHour: 1.5 }).length, 1)
  assert.equal(validateGameSchedule({ ...central, nightlyRunMinute: 60 }).length, 1)
  assert.equal(validateGameSchedule({ ...central, competitionSweepMinutes: 0 }).length, 1)
  assert.equal(validateGameSchedule({ ...central, competitionSweepMinutes: 1.5 }).length, 1)
})

test("a time zone is validated against the runtime, not a list someone typed", () => {
  assert.equal(isValidTimeZone("America/Chicago"), true)
  assert.equal(isValidTimeZone("UTC"), true)
  assert.equal(isValidTimeZone("Pacific/Auckland"), true)
  assert.equal(isValidTimeZone("America/Chicargo"), false)
  assert.equal(isValidTimeZone(""), false)
})

test("the validator accepts more than the picker will offer", () => {
  // `Intl.supportedValuesOf` is the right list to put in a dropdown — 418
  // canonical names, no legacy aliases — but it is the wrong thing to validate
  // against, for two reasons this pins down.
  const canonical = Intl.supportedValuesOf("timeZone")

  // "UTC" is not in it. Validating against the list would reject the column's
  // own default, which is the value every game starts on.
  assert.equal(canonical.includes("UTC"), false)
  assert.equal(isValidTimeZone("UTC"), true)

  // Legacy aliases are not in it either, and they do work — "CST" carries the
  // full Chicago rules, daylight saving included, rather than being a frozen
  // -6 offset. Worth knowing before anyone "corrects" a stored value.
  assert.equal(canonical.includes("CST"), false)
  assert.equal(isValidTimeZone("CST"), true)
  assert.equal(
    nextBoundaryFor("NIGHTLY", { ...central, gameTimeZone: "CST" }, at("2026-07-01T12:00:00Z")).toISOString(),
    nextBoundaryFor("NIGHTLY", central, at("2026-07-01T12:00:00Z")).toISOString()
  )
})

test("a schedule describes itself in the game's own terms", () => {
  assert.equal(describeSchedule("NIGHTLY", central), "daily at 00:00 America/Chicago")
  assert.equal(describeSchedule("NIGHTLY", { ...central, nightlyRunHour: 3, nightlyRunMinute: 5 }), "daily at 03:05 America/Chicago")
  assert.equal(describeSchedule("COMPETITION_SWEEP", central), "hourly, on the hour")
  assert.equal(describeSchedule("COMPETITION_SWEEP", { ...central, competitionSweepMinutes: 180 }), "every 3 hours")
  assert.equal(describeSchedule("COMPETITION_SWEEP", { ...central, competitionSweepMinutes: 15 }), "every 15 minutes")
})

test("the system clock returns the present", () => {
  const before = Date.now()
  const reading = systemClock.now().getTime()
  const after = Date.now()
  assert.ok(reading >= before && reading <= after, "systemClock did not read the current time")
})
