import { test } from "node:test"
import assert from "node:assert/strict"

// Everything a tick decides, decided without a database. The runner reads
// rows, asks these functions, and writes the answer down; this is where the
// answers are checked.
const { isLeaseLive, isClaimable, materializeTask, planGameRuns } =
  await import("../src/schedule/plan.ts")

const at = (iso: string) => new Date(iso)

const central = {
  nightlyRunHour: 0,
  nightlyRunMinute: 0,
  gameTimeZone: "America/Chicago",
  competitionSweepMinutes: 60,
}

const task = (taskType: "NIGHTLY" | "COMPETITION_SWEEP", nextRunAt: string) => ({
  id: `task-${taskType}`,
  gameId: "game-1",
  taskType,
  nextRunAt: at(nextRunAt),
})

type RunOverrides = {
  id?: string
  taskType?: "NIGHTLY" | "COMPETITION_SWEEP"
  scheduledFor?: string
  status?: "PENDING" | "RUNNING" | "RETRYING" | "COMPLETED" | "FAILED" | "CANCELLED"
  leaseUntil?: string | null
}

const run = (overrides: RunOverrides = {}) => ({
  id: overrides.id ?? "run-1",
  taskType: overrides.taskType ?? ("COMPETITION_SWEEP" as const),
  scheduledFor: at(overrides.scheduledFor ?? "2026-10-06T13:00:00Z"),
  status: overrides.status ?? ("PENDING" as const),
  leaseUntil: overrides.leaseUntil === undefined ? null : overrides.leaseUntil === null ? null : at(overrides.leaseUntil),
})

// ---------------------------------------------------------------- materialize

test("a punctual tick covers the boundary that just passed and moves on one", () => {
  const plan = materializeTask(task("COMPETITION_SWEEP", "2026-10-06T13:00:00Z"), central, at("2026-10-06T13:00:02Z"))

  assert.equal(plan.scheduledFor.toISOString(), "2026-10-06T13:00:00.000Z")
  assert.equal(plan.nextRunAt.toISOString(), "2026-10-06T14:00:00.000Z")
  assert.equal(plan.lateByMs, 2000)
})

test("a run missed over a long outage happens once, not once per boundary", () => {
  // The reason `nextRunAt` is read from the present rather than stepped on from
  // the boundary that was missed. Three days of downtime would otherwise
  // materialize seventy-two sweeps, every one of which then has to be cancelled
  // again — and three nightlies, which is three passes over every animal.
  const plan = materializeTask(task("COMPETITION_SWEEP", "2026-10-03T13:00:00Z"), central, at("2026-10-06T19:50:00Z"))

  assert.equal(plan.nextRunAt.toISOString(), "2026-10-06T20:00:00.000Z")
  assert.equal(plan.lateByMs, 3 * 86_400_000 + 6 * 3_600_000 + 50 * 60_000)
})

test("the late run still records which boundary it was for", () => {
  // It is a catch-up, and saying so honestly is what makes "did Saturday's
  // nightly ever run?" answerable afterwards.
  const plan = materializeTask(task("NIGHTLY", "2026-10-03T05:00:00Z"), central, at("2026-10-06T19:50:00Z"))

  assert.equal(plan.scheduledFor.toISOString(), "2026-10-03T05:00:00.000Z")
  assert.equal(plan.nextRunAt.toISOString(), "2026-10-07T05:00:00.000Z")
})

test("the next boundary is always ahead of the tick that set it", () => {
  // If it were not, the task would be due again immediately and the same slot
  // would be claimed on every tick forever.
  const now = at("2026-10-06T19:50:00Z")
  for (const type of ["NIGHTLY", "COMPETITION_SWEEP"] as const) {
    const plan = materializeTask(task(type, "2026-10-06T19:00:00Z"), central, now)
    assert.ok(plan.nextRunAt.getTime() > now.getTime(), `${type} did not move ahead of now`)
  }
})

// ----------------------------------------------------------------- the lease

test("a lease is live only while something is renewing it", () => {
  const now = at("2026-10-06T13:00:00Z")
  assert.equal(isLeaseLive(run({ status: "RUNNING", leaseUntil: "2026-10-06T13:02:00Z" }), now), true)
  assert.equal(isLeaseLive(run({ status: "RUNNING", leaseUntil: "2026-10-06T12:58:00Z" }), now), false)
  assert.equal(isLeaseLive(run({ status: "PENDING" }), now), false)
})

test("a RUNNING row with no lease is treated as abandoned", () => {
  // The claim sets status and lease in one statement, so this cannot happen on
  // the normal path. If it ever does, reclaiming gets the game moving again;
  // treating it as live would stop that game's nightly permanently and need
  // somebody to go and fix a row by hand.
  assert.equal(isClaimable(run({ status: "RUNNING", leaseUntil: null }), at("2026-10-06T13:00:00Z")), true)
})

test("a lease that expires exactly now has expired", () => {
  // The boundary case the database predicate has to agree with. `claimableWhere`
  // in runner.ts uses `lte` for this reason: with `lt`, the planner would offer
  // a run the claim then refused, the run would drop out of the tick, and the
  // next tick would do the same thing — stuck forever, silently.
  const now = at("2026-10-06T13:00:00Z")
  assert.equal(isLeaseLive(run({ status: "RUNNING", leaseUntil: "2026-10-06T13:00:00Z" }), now), false)
  assert.equal(isClaimable(run({ status: "RUNNING", leaseUntil: "2026-10-06T13:00:00Z" }), now), true)
})

test("every status is answered for, including the finished ones", () => {
  const now = at("2026-10-06T13:00:00Z")
  assert.equal(isClaimable(run({ status: "PENDING" }), now), true)
  assert.equal(isClaimable(run({ status: "RETRYING" }), now), true)
  assert.equal(isClaimable(run({ status: "RUNNING", leaseUntil: "2026-10-06T13:02:00Z" }), now), false)
  assert.equal(isClaimable(run({ status: "RUNNING", leaseUntil: "2026-10-06T12:58:00Z" }), now), true)
  assert.equal(isClaimable(run({ status: "COMPLETED" }), now), false)
  assert.equal(isClaimable(run({ status: "FAILED" }), now), false)
  assert.equal(isClaimable(run({ status: "CANCELLED" }), now), false)
})

// ------------------------------------------------------------------- planning

test("nothing waiting means nothing to do", () => {
  const plan = planGameRuns([], at("2026-10-06T13:00:00Z"))
  assert.equal(plan.execute, null)
  assert.deepEqual(plan.supersede, [])
  assert.deepEqual(plan.deferred, [])
  assert.equal(plan.blockedBy, null)
})

test("the nightly goes first when both are waiting", () => {
  // It is the one with a time players are told, and the one that takes half an
  // hour. The sweep it delays is idempotent and loses nothing by waiting.
  const plan = planGameRuns(
    [
      run({ id: "sweep", taskType: "COMPETITION_SWEEP", scheduledFor: "2026-10-07T05:00:00Z" }),
      run({ id: "nightly", taskType: "NIGHTLY", scheduledFor: "2026-10-07T05:00:00Z" }),
    ],
    at("2026-10-07T05:00:01Z")
  )

  assert.equal(plan.execute?.id, "nightly")
  assert.deepEqual(plan.deferred.map((r) => r.id), ["sweep"])
})

test("sweeps that piled up collapse to the newest one", () => {
  // Three hours of nightly means three hourly sweeps queued behind it. Running
  // all three does the same scan three times and resolves nothing the last one
  // would not have resolved on its own.
  const plan = planGameRuns(
    [
      run({ id: "13:00", scheduledFor: "2026-10-06T13:00:00Z" }),
      run({ id: "14:00", scheduledFor: "2026-10-06T14:00:00Z" }),
      run({ id: "15:00", scheduledFor: "2026-10-06T15:00:00Z" }),
    ],
    at("2026-10-06T15:30:00Z")
  )

  assert.equal(plan.execute?.id, "15:00")
  assert.deepEqual(plan.supersede.map((r) => r.id).sort(), ["13:00", "14:00"])
})

test("a game holding a live lease starts nothing else", () => {
  // One run at a time per game: aging an animal and resolving a competition it
  // is entered in must not interleave.
  const holder = run({ id: "nightly", taskType: "NIGHTLY", status: "RUNNING", leaseUntil: "2026-10-07T05:32:00Z" })
  const plan = planGameRuns([holder, run({ id: "sweep", scheduledFor: "2026-10-07T06:00:00Z" })], at("2026-10-07T05:30:00Z"))

  assert.equal(plan.execute, null)
  assert.equal(plan.blockedBy?.id, "nightly")
  assert.deepEqual(plan.deferred.map((r) => r.id), ["sweep"])
})

test("a blocked game still clears its backlog", () => {
  // Superseding while blocked is what stops the pile growing for the length of
  // a nightly, so the queue found afterwards is one run and not thirty.
  const plan = planGameRuns(
    [
      run({ id: "nightly", taskType: "NIGHTLY", status: "RUNNING", leaseUntil: "2026-10-07T07:32:00Z" }),
      run({ id: "06:00", scheduledFor: "2026-10-07T06:00:00Z" }),
      run({ id: "07:00", scheduledFor: "2026-10-07T07:00:00Z" }),
    ],
    at("2026-10-07T07:30:00Z")
  )

  assert.equal(plan.execute, null)
  assert.deepEqual(plan.supersede.map((r) => r.id), ["06:00"])
  assert.deepEqual(plan.deferred.map((r) => r.id), ["07:00"])
})

test("a run left behind by a crash is picked up again", () => {
  // The server died mid-nightly. Its lease was never renewed, so it lapsed, and
  // the work is unfinished. Re-running it is safe: `selectAnimalsForAging` only
  // picks animals interacted with during their current cycle, and an animal
  // already aged has moved past that cycle.
  const plan = planGameRuns(
    [run({ id: "crashed", taskType: "NIGHTLY", status: "RUNNING", leaseUntil: "2026-10-07T05:02:00Z" })],
    at("2026-10-07T05:40:00Z")
  )

  assert.equal(plan.execute?.id, "crashed")
  assert.equal(plan.blockedBy, null)
})

test("a newer boundary wins over a crashed older one", () => {
  // Last night's nightly died and tonight's is due. Finishing yesterday's a day
  // late would age the same animals tonight's run is about to age anyway.
  const plan = planGameRuns(
    [
      run({ id: "yesterday", taskType: "NIGHTLY", status: "RUNNING", leaseUntil: "2026-10-06T05:02:00Z", scheduledFor: "2026-10-06T05:00:00Z" }),
      run({ id: "tonight", taskType: "NIGHTLY", scheduledFor: "2026-10-07T05:00:00Z" }),
    ],
    at("2026-10-07T05:00:01Z")
  )

  assert.equal(plan.execute?.id, "tonight")
  assert.deepEqual(plan.supersede.map((r) => r.id), ["yesterday"])
})

test("finished runs are not candidates for anything", () => {
  const plan = planGameRuns(
    [
      run({ id: "done", status: "COMPLETED" }),
      run({ id: "failed", status: "FAILED" }),
      run({ id: "cancelled", status: "CANCELLED" }),
    ],
    at("2026-10-06T15:00:00Z")
  )

  assert.equal(plan.execute, null)
  assert.deepEqual(plan.supersede, [])
  assert.deepEqual(plan.deferred, [])
})

test("a retrying run is claimable like a pending one", () => {
  const plan = planGameRuns([run({ id: "retry", status: "RETRYING" })], at("2026-10-06T15:00:00Z"))
  assert.equal(plan.execute?.id, "retry")
})

test("every claimable run ends up in exactly one outcome", () => {
  // Nothing may be silently dropped: a run that is neither executed, cancelled
  // nor deferred would sit PENDING forever without anyone noticing.
  const runs = [
    run({ id: "nightly", taskType: "NIGHTLY", scheduledFor: "2026-10-07T05:00:00Z" }),
    run({ id: "sweep-old", scheduledFor: "2026-10-07T05:00:00Z" }),
    run({ id: "sweep-new", scheduledFor: "2026-10-07T06:00:00Z" }),
    run({ id: "done", status: "COMPLETED" }),
  ]
  const plan = planGameRuns(runs, at("2026-10-07T06:30:00Z"))

  const accounted = [
    ...(plan.execute ? [plan.execute.id] : []),
    ...plan.supersede.map((r) => r.id),
    ...plan.deferred.map((r) => r.id),
  ].sort()

  assert.deepEqual(accounted, ["nightly", "sweep-new", "sweep-old"])
  assert.equal(new Set(accounted).size, accounted.length, "a run appeared in two outcomes")
})
