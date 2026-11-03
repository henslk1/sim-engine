import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { mutationsIn } from "./gameplay-scan.ts"

/**
 * Every gameplay write opens through `enterGameplay`.
 *
 * The middleware guard answers "is this game updating" before the resolver
 * runs, which is necessary and not sufficient: a nightly can start in the gap
 * between that answer and the write it was protecting. Closing that gap means
 * taking the game's lock in shared mode inside the mutation's own transaction
 * and rechecking through it, which only works if every mutation actually does
 * it - one that does not is a hole, and a hole nobody can see is worse than no
 * lock at all.
 *
 * So coverage is asserted here rather than remembered, and the scanning is done
 * by the TypeScript parser rather than by regular expressions. `gameplay-scan.ts`
 * records the three ways hand-rolled scanning got this wrong, every one of which
 * made this suite pass while checking less than it claimed.
 */

const ROUTERS = fileURLToPath(new URL("../src/routers/", import.meta.url))

const GAMEPLAY_ROUTERS = [
  "animal.animal.ts",
  "animal.care.ts",
  "animal.competition.ts",
  "animal.genetics.ts",
  "animal.training.ts",
  "breeding.cover.ts",
  "breeding.listing.ts",
  "breeding.material.ts",
  "breeding.pregnancy.ts",
  "inventory.ts",
  "player.ts",
  "stageActivity.ts",
  "tutorial.ts",
  "vet.ts",
]

/**
 * Mutations that write nothing the nightly contends for.
 *
 * Each one is a claim that wants checking if the mutation changes.
 */
const EXEMPT: Record<string, string[]> = {
  "player.ts": [
    // Per-player display state. The nightly never reads any of it, so blocking
    // these during an update would be an irritation with no safety behind it.
    "saveSubContainerPreferences",
    "updateProfile",
    "updateVisibility",
    "updateNotificationSetting",
    // Creates the account itself. There is no animal yet for a nightly to be
    // halfway through, and onboarding should not fail because one is running.
    "create",
    // Development-only currency grant.
    "addTestCurrency",
  ],
  "tutorial.ts": [
    // A pointer into the tutorial script, not game state.
    "setDriverStep",
    // Development tools, and the ones most needed when something is stuck.
    "devDeleteAccount",
    "devReset",
    "devFixStarter",
    // Reads the player's starter breed and stat spread and returns a computed
    // prediction. It writes nothing at all, so there is nothing for a nightly
    // to collide with - the same reason `breeding.cover.runPredictor` is here.
    "runPredictor",
  ],
  "breeding.cover.ts": [
    // Reads and predicts; writes nothing but its own quota row.
    "runPredictor",
  ],
  "animal.animal.ts": [
    // Paddocks themselves are player organisation; the nightly never reads or
    // writes SubContainer. Deleting one is a different matter and is NOT
    // exempt - it clears `subContainerId` on every animal inside it, which is
    // the same column the nightly is free to be writing.
    "createSubContainer",
    "updateSubContainer",
  ],
}

/**
 * Mutations that must exist and must be protected.
 *
 * Discovery alone is not coverage: a mutation that is renamed, moved or deleted
 * simply stops being found, and the suite stays green while the path it covered
 * goes unprotected or disappears. These are the ones whose absence should be
 * loud.
 */
const REQUIRED: Array<[string, string]> = [
  ["animal.care.ts", "perform"],
  ["animal.training.ts", "perform"],
  ["animal.competition.ts", "enter"],
  ["animal.genetics.ts", "testLocus"],
  ["stageActivity.ts", "perform"],
  ["vet.ts", "exam"],
  ["vet.ts", "startTreatment"],
  ["vet.ts", "administerTreatment"],
  ["vet.ts", "euthanize"],
  ["breeding.cover.ts", "send"],
  ["breeding.cover.ts", "accept"],
  ["breeding.material.ts", "collectMaterial"],
  ["breeding.material.ts", "implant"],
  ["breeding.pregnancy.ts", "birth"],
  ["inventory.ts", "buy"],
  ["animal.animal.ts", "advanceAge"],
  ["animal.animal.ts", "bury"],
  ["animal.animal.ts", "deleteSubContainer"],
]

function scan(router: string) {
  return mutationsIn(readFileSync(`${ROUTERS}${router}`, "utf8"), router)
}

test("the gameplay router list has not drifted from the files on disk", () => {
  const present = readdirSync(ROUTERS).filter((f) => f.endsWith(".ts"))
  for (const router of GAMEPLAY_ROUTERS) {
    assert.ok(present.includes(router), `${router} is listed here but no longer exists`)
  }

  // A new non-admin router with mutations has to be classified deliberately,
  // one way or the other, rather than defaulting to unprotected.
  const exemptFiles = [
    "messaging.ts",
    "bugReport.ts",
    "supportTicket.ts",
    "notification.ts",
    "social.ts",
    "game.ts",
  ]
  const unclassified = present.filter((file) => {
    if (GAMEPLAY_ROUTERS.includes(file)) return false
    if (file.startsWith("admin.")) return false
    if (exemptFiles.includes(file)) return false
    return scan(file).length > 0
  })

  assert.deepEqual(unclassified, [], "a router with mutations is neither gameplay nor exempt")
})

test("every gameplay mutation opens through enterGameplay", () => {
  const holes: string[] = []
  let scanned = 0

  for (const router of GAMEPLAY_ROUTERS) {
    const exempt = EXEMPT[router] ?? []
    for (const mutation of scan(router)) {
      scanned++
      if (exempt.includes(mutation.name)) continue
      if (mutation.opensLock) continue
      holes.push(`${router}: ${mutation.name}`)
    }
  }

  // A rename or a reshaped router could empty the scan and leave this suite
  // green while checking nothing at all. There are about seventy gameplay
  // mutations; far fewer than that means the scanner has stopped finding them.
  assert.ok(scanned > 50, `only ${scanned} gameplay mutations were scanned - the scan has drifted`)

  assert.deepEqual(holes, [], "these gameplay mutations write without taking the game's lock")
})

test("the mutations that must be protected are present and protected", () => {
  const missing: string[] = []
  const unprotected: string[] = []

  for (const [router, name] of REQUIRED) {
    const found = scan(router).find((m) => m.name === name)
    if (!found) {
      missing.push(`${router}: ${name}`)
      continue
    }
    if (!found.opensLock) unprotected.push(`${router}: ${name}`)
  }

  assert.deepEqual(missing, [], "a mutation this test requires has been renamed, moved or removed")
  assert.deepEqual(unprotected, [], "a required mutation writes without taking the game's lock")
})

test("nothing is written before the lock is taken", () => {
  // Taking the lock late is the same as not taking it. A mutation that charges
  // a fee, or creates a row, and only then checks whether the game is updating
  // has already committed the part that mattered.
  const offences: string[] = []

  for (const router of GAMEPLAY_ROUTERS) {
    for (const mutation of scan(router)) {
      for (const write of mutation.writesBeforeLock) {
        offences.push(`${router}: ${mutation.name}: ${write} before taking the lock`)
      }
    }
  }

  assert.deepEqual(offences, [])
})

test("protected work stays on the transaction that holds the lock", () => {
  // Scoped to the locked transaction's own callback. Work outside it is not an
  // offence - a mutation whose write can collide on a unique key has to catch
  // that outside the transaction, because an aborted one cannot answer another
  // query.
  const offences: string[] = []

  for (const router of GAMEPLAY_ROUTERS) {
    for (const mutation of scan(router)) {
      if (mutation.nestedTransaction) {
        offences.push(`${router}: ${mutation.name}: opens a second transaction inside the lock`)
      }
      for (const escape of mutation.escapes) {
        offences.push(`${router}: ${mutation.name}: ${escape} uses the global client inside the lock`)
      }
      for (const use of mutation.recoveryOnTx) {
        offences.push(
          `${router}: ${mutation.name}: ${use} is used after its transaction has closed`
        )
      }
      for (const helper of mutation.escapingHelpers) {
        offences.push(
          `${router}: ${mutation.name}: ${helper} reaches the database on its own connection`
        )
      }
    }
  }

  assert.deepEqual(offences, [])
})

// ── The scanner itself ──────────────────────────────────────────────────────
//
// Permanent, because three earlier versions of this scanning passed by finding
// nothing at all. A scanner is worth its assertions only if it can be shown to
// fail on the things it claims to catch.

test("the scanner finds mutations in nested routers", () => {
  const found = mutationsIn(`
    export const r = router({
      top: publicProcedure.input(z.object({})).mutation(async () => db.a.create({})),
      group: router({
        nested: publicProcedure.input(z.object({})).mutation(async () => db.b.create({})),
      }),
      aQuery: publicProcedure.query(() => db.c.findMany()),
    })
  `)
  assert.deepEqual(found.map((m) => m.name).sort(), ["nested", "top"])
})

test("the scanner catches a deliberate escape inside the locked transaction", () => {
  const found = mutationsIn(`
    export const r = router({
      leaky: publicProcedure.mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplayForAnimal(tx, input.animalId)
          return db.animal.update({ where: { id: input.animalId }, data: {} })
        })
      ),
    })
  `)
  assert.equal(found.length, 1)
  assert.equal(found[0]!.opensLock, true)
  assert.deepEqual(
    found[0]!.escapes.map((e) => e.split(" at ")[0]),
    ["db.animal"],
    "a global-client write inside the lock must be reported"
  )
})

test("a bracket inside a string cannot end the scan early", () => {
  // The case hand-rolled bracket matching got wrong: a ")" inside a message
  // closed the transaction's body in the scanner's eyes and hid everything
  // after it.
  const found = mutationsIn(`
    export const r = router({
      sneaky: publicProcedure.mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplay(tx, input.gameId)
          if (!input.ok) throw new Error("not allowed :) see the docs (really)")
          return db.player.update({ where: { id: input.id }, data: {} })
        })
      ),
    })
  `)
  assert.deepEqual(
    found[0]!.escapes.map((e) => e.split(" at ")[0]),
    ["db.player"],
    "an escape after a string containing brackets must still be found"
  )
})

test("work outside the locked transaction is not reported as an escape", () => {
  const found = mutationsIn(`
    export const r = router({
      idempotent: publicProcedure.mutation(async ({ input }) => {
        try {
          await db.$transaction(async (tx) => {
            await enterGameplay(tx, input.gameId)
            await tx.grant.create({ data: { id: input.grantId } })
          })
        } catch (error) {
          if (!(await db.grant.findUnique({ where: { id: input.grantId } }))) throw error
        }
      }),
    })
  `)
  assert.deepEqual(found[0]!.escapes, [], "the catch runs after the transaction, not inside it")
})

test("the scanner reports a write that happens before the lock", () => {
  const found = mutationsIn(`
    export const r = router({
      early: publicProcedure.mutation(async ({ input }) => {
        await db.tier.create({ data: {} })
        return db.$transaction(async (tx) => {
          await enterGameplay(tx, input.gameId)
          return tx.entry.create({ data: {} })
        })
      }),
    })
  `)
  assert.equal(found[0]!.writesBeforeLock.length, 1)
  assert.match(found[0]!.writesBeforeLock[0]!, /^create at line/)
})

test("the scanner reports a recovery written on the closed transaction", () => {
  // Catching a duplicate key and then asking `tx` whether the row exists is the
  // natural way to write this and does not work: the collision has already
  // aborted the transaction, so the recovery query fails too. The race that
  // produces it cannot be forced reliably through a route, so it is caught here
  // instead of in the concurrency suite.
  const found = mutationsIn(`
    export const r = router({
      granting: publicProcedure.mutation(async ({ input }) => {
        try {
          await db.$transaction(async (tx) => {
            await enterGameplay(tx, input.gameId)
            await tx.grant.create({ data: { id: input.grantId } })
          })
        } catch (error) {
          if (!(await tx.grant.findUnique({ where: { id: input.grantId } }))) throw error
        }
      }),
    })
  `)
  assert.deepEqual(
    found[0]!.recoveryOnTx.map((u) => u.split(" at ")[0]),
    ["tx.grant"]
  )
})

test("the scanner reports a helper that reaches the database on its own", () => {
  // The scan does not follow calls into helpers, so the ones that take no
  // client are listed by name. `completeStep` called one of these inside its
  // transaction: the deletions survived rollback, and the helper blocked on a
  // row the calling transaction had deleted and not yet committed.
  const found = mutationsIn(`
    export const r = router({
      finishing: publicProcedure.mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplay(tx, input.gameId)
          await tx.pair.delete({ where: { id: input.pairId } })
          await deleteAnimalsWithChildren([input.a, input.b])
        })
      ),
    })
  `)
  assert.deepEqual(
    found[0]!.escapingHelpers.map((h) => h.split(" at ")[0]),
    ["deleteAnimalsWithChildren"]
  )
})

test("the scanner reports a transaction nested on the transaction client", () => {
  // `tx.$transaction(...)` typechecks and throws at runtime, so the compiler
  // will not catch one a conversion left behind. Three of these survived a
  // batch conversion in tutorial.ts with the typecheck clean.
  const found = mutationsIn(`
    export const r = router({
      leftBehind: publicProcedure.mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplay(tx, input.gameId)
          await tx.$transaction([tx.a.create({ data: {} })])
        })
      ),
    })
  `)
  assert.equal(found[0]!.nestedTransaction, true)
})

test("the scanner reports a nested transaction", () => {
  const found = mutationsIn(`
    export const r = router({
      nestedTx: publicProcedure.mutation(async ({ input }) =>
        db.$transaction(async (tx) => {
          await enterGameplay(tx, input.gameId)
          await db.$transaction(async (inner) => inner.a.create({ data: {} }))
        })
      ),
    })
  `)
  assert.equal(found[0]!.nestedTransaction, true)
})
