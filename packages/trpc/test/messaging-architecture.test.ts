import { test } from "node:test"
import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { basename, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

// Messaging code may not define an unauthenticated procedure.
//
// `publicProcedure` means ctx.userId can be null, and the common pattern in
// this codebase is to take playerAccountId from the caller — which together
// would let an unauthenticated request act as anybody. Messaging derives the
// acting player from the session instead, and this test is what keeps it that
// way when someone adds a router in a hurry.

const SRC = fileURLToPath(new URL("../src/", import.meta.url))

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bpublicProcedure\b/, why: "publicProcedure permits a null userId" },
  { pattern: /\bt\.procedure\b/, why: "a raw procedure skips every guard in trpc.ts" },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

// Everything in the messaging module, plus any router named for it. A messaging
// router that does not follow the naming convention would escape this scan, so
// the convention is part of the rule.
function messagingFiles(): string[] {
  const module = walk(join(SRC, "messaging"))
  const routers = readdirSync(join(SRC, "routers"))
    .filter(name => /^(messaging|chat)\b/.test(name) && name.endsWith(".ts"))
    .map(name => join(SRC, "routers", name))
  return [...module, ...routers]
}

function offences(source: string): string[] {
  const found: string[] = []
  for (const line of source.split(/\r?\n/)) {
    // A line that only talks about the rule is not a breach of it.
    if (line.trim().startsWith("//")) continue
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(line)) found.push(`${line.trim()}  — ${why}`)
    }
  }
  return found
}

test("the detector catches what it is looking for", () => {
  // Without this, a broken pattern would make the real test below pass for the
  // wrong reason and nobody would notice.
  assert.equal(offences("export const list = publicProcedure.query(() => [])").length, 1)
  assert.equal(offences("const base = t.procedure.use(mw)").length, 1)
  assert.equal(offences("import { protectedProcedure } from '../trpc.js'").length, 0)
  assert.equal(offences("// never use publicProcedure here").length, 0)
})

test("the scan reaches the messaging module instead of silently finding nothing", () => {
  const names = messagingFiles().map(file => basename(file))
  // A rename or a move that emptied the scan would otherwise leave this suite
  // green while guarding nothing at all.
  for (const expected of ["permissions.ts", "messages.ts", "procedures.ts", "actor.ts"]) {
    assert.ok(names.includes(expected), `${expected} was not scanned`)
  }
})

test("messaging defines no unauthenticated procedures", () => {
  const failures: string[] = []
  for (const file of messagingFiles()) {
    for (const offence of offences(readFileSync(file, "utf8"))) {
      failures.push(`${relative(SRC, file)}: ${offence}`)
    }
  }
  assert.deepEqual(failures, [])
})
