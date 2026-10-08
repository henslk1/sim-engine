import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

// The scheduler reads the time in one place and decides what a configured time
// zone means in one place, and these tests are what keep it that way.
//
// This is not tidiness. Three separate bugs are being held shut here:
//
//   * A decision built from more than one clock reading can plan against one
//     instant and write against another. A lease checked at 13:00:00.000 and
//     acted on at 13:00:00.400 is a race that appears roughly never, and then
//     appears on the night a database call is slow. (Taking a fresh reading
//     between runs is the opposite and is deliberate — what matters is that
//     every reading comes from the injected clock.)
//
//   * Prisma maps every DateTime in this schema to `timestamp(3)` and stores
//     UTC in it, but a Postgres session is not necessarily on UTC — the dev
//     one runs on America/Chicago. So raw `NOW()` returns a value five hours
//     adrift from what the columns hold, and a lease set that way would be
//     expired the moment it was written, making every RUNNING run look like a
//     crash to be restarted. It would also behave differently in production,
//     where the host is UTC, than in dev.
//
//   * A boundary computed anywhere other than `nextBoundaryFor` is a boundary
//     computed from something other than the game's own configuration, which
//     is how the nightly ended up following whatever machine it was hosted on
//     in the first place.

const SCHEDULE_SRC = fileURLToPath(new URL("../src/schedule/", import.meta.url))
const SCHEDULER_SRC = fileURLToPath(new URL("../../../apps/server/src/scheduler/", import.meta.url))

type Rule = {
  pattern: RegExp
  why: string
  /** Files this rule does not apply to, by base name. */
  allow?: string[]
}

const RULES: Rule[] = [
  {
    pattern: /\bnew Date\s*\(\s*\)/,
    why: "reads the clock directly — take a Clock and call clock.now()",
    allow: ["clock.ts"],
  },
  {
    pattern: /\bDate\.now\s*\(/,
    why: "reads the clock directly — take a Clock and call clock.now()",
    allow: ["clock.ts"],
  },
  {
    pattern: /\bIntl\.DateTimeFormat\b/,
    why: "interprets a time zone outside the module that owns time zones",
    allow: ["time.ts", "clock.ts"],
  },
  {
    // Deliberately a ban on raw SQL rather than on `NOW()` specifically. Going
    // through Prisma's typed path is what makes the timestamps correct without
    // anyone having to remember why. If the scheduler ever genuinely needs raw
    // SQL — `FOR UPDATE SKIP LOCKED` across several instances is the likely
    // reason — this rule is the place to come and think about it, and the
    // answer is to bind JS Dates as parameters or to write
    // `(NOW() AT TIME ZONE 'UTC')`, never a bare `NOW()`.
    pattern: /\$(?:query|execute)Raw(?:Unsafe)?\b/,
    why: "raw SQL against timestamp columns the session's time zone would misread",
  },
  {
    // Belt and braces, for SQL that arrives as a plain string. Case-sensitive:
    // `clock.now()` is the thing this file exists to encourage.
    pattern: /(?<![.\w])(?:NOW|CURRENT_TIMESTAMP|LOCALTIMESTAMP)\s*\(/,
    why: "SQL clock function — the session's time zone is not the columns' time zone",
  },
  {
    pattern: /\bnext(?:Daily|Interval)Boundary\b/,
    why: "computes a boundary directly — go through nextBoundaryFor so the game's config decides",
    allow: ["time.ts", "clock.ts"],
  },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

function schedulerFiles(): string[] {
  return [SCHEDULE_SRC, SCHEDULER_SRC].flatMap((root) =>
    walk(root).filter((file) => file.endsWith(".ts"))
  )
}

/** A line that only talks about a rule is not a breach of it. */
function isComment(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")
}

function offences(source: string, fileName: string): string[] {
  const found: string[] = []

  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (isComment(line)) continue
    for (const rule of RULES) {
      if (rule.allow?.includes(fileName)) continue
      if (rule.pattern.test(line)) found.push(`${index + 1}: ${line.trim()}  — ${rule.why}`)
    }
  }

  return found
}

test("the detector catches what it is looking for", () => {
  // Without this, a pattern that stopped matching anything would leave the real
  // tests below green while guarding nothing at all.
  assert.equal(offences("const now = new Date()", "runner.ts").length, 1)
  assert.equal(offences("const t = Date.now()", "runner.ts").length, 1)
  assert.equal(offences("const rows = await db.$queryRaw(sql)", "runner.ts").length, 1)
  assert.equal(offences("await db.$executeRawUnsafe(statement)", "runner.ts").length, 1)
  assert.equal(offences(`const sql = "SET lease = NOW() + interval '2 min'"`, "runner.ts").length, 1)
  assert.equal(offences("return nextDailyBoundary(after, time, zone)", "runner.ts").length, 1)
  assert.equal(offences("new Intl.DateTimeFormat('en-US', { timeZone })", "runner.ts").length, 1)

  // And the things that are fine stay fine.
  assert.equal(offences("const now = clock.now()", "runner.ts").length, 0)
  assert.equal(offences("now(): Date", "clock.ts").length, 0)
  assert.equal(offences("new Date(now.getTime() + leaseMs)", "runner.ts").length, 0)
  assert.equal(offences("const cutoff = new Date(startedAt.getTime() - DAY)", "handlers.ts").length, 0)
  assert.equal(offences("// never call new Date() here", "runner.ts").length, 0)
  assert.equal(offences(" * takes a Date rather than calling Date.now()", "runner.ts").length, 0)

  // The allowlist is per file, not global.
  assert.equal(offences("now: () => new Date()", "clock.ts").length, 0)
  assert.equal(offences("return nextIntervalBoundary(after, minutes)", "clock.ts").length, 0)
})

test("the scan reaches both halves of the scheduler", () => {
  const names = schedulerFiles().map((file) => basename(file))

  // A move or a rename that emptied the scan would otherwise leave this suite
  // green while checking an empty list of files.
  for (const expected of ["time.ts", "clock.ts", "plan.ts", "runner.ts", "handlers.ts", "backend.ts"]) {
    assert.ok(names.includes(expected), `${expected} was not scanned`)
  }
})

test("the scheduler reads the clock in one place and nowhere else", () => {
  const failures: string[] = []

  for (const file of schedulerFiles()) {
    for (const offence of offences(readFileSync(file, "utf8"), basename(file))) {
      failures.push(`${basename(file)}:${offence}`)
    }
  }

  assert.deepEqual(failures, [])
})

test("nothing anywhere computes a boundary except through nextBoundaryFor", () => {
  // Wider than the scan above, and the only rule that needs to be. The
  // scheduler is not the only thing that asks when a game next runs — the
  // admin router moves `nextRunAt` when the settings change, and anything else
  // that grows a reason to will be somewhere else again. Whoever asks, the
  // answer has to come from the game's own configuration, which is what
  // `nextBoundaryFor` guarantees and what calling the raw functions skips.
  const roots = [
    fileURLToPath(new URL("../src/", import.meta.url)),
    fileURLToPath(new URL("../../trpc/src/", import.meta.url)),
    fileURLToPath(new URL("../../../apps/server/src/", import.meta.url)),
  ]
  const allowed = ["time.ts", "clock.ts"]

  const failures = roots.flatMap((root) =>
    walk(root)
      .filter((file) => file.endsWith(".ts"))
      .filter((file) => !allowed.includes(basename(file)))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((line, index) => ({ line, number: index + 1 }))
          .filter(({ line }) => !isComment(line) && /\bnext(?:Daily|Interval)Boundary\b/.test(line))
          .map(({ line, number }) => `${relative(root, file)}:${number}: ${line.trim()}`)
      )
  )

  assert.deepEqual(failures, [])
})

test("there is exactly one clock reading in the whole scheduler", () => {
  // The allowlist above lets clock.ts construct a date; this pins it to the one
  // line that defines `systemClock`, so the exemption cannot quietly grow.
  const readings = schedulerFiles().flatMap((file) =>
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => !isComment(line))
      .filter((line) => /\bnew Date\s*\(\s*\)|\bDate\.now\s*\(/.test(line))
      .map((line) => `${basename(file)}: ${line.trim()}`)
  )

  assert.deepEqual(readings, ["clock.ts: now: () => new Date(),"])
})
