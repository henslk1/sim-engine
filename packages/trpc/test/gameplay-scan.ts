import ts from "typescript"

/**
 * Finding gameplay mutations and what they do, through the TypeScript parser.
 *
 * This started as regular expressions over the source text and was wrong three
 * times in three different ways, each of which made the suite *pass* while
 * checking less than it claimed:
 *
 *   - matching any two-space key caught nested object literals and split
 *     mutations in the middle;
 *   - matching only two-space keys then missed the nested routers, so nine
 *     mutations were never discovered at all;
 *   - matching brackets by counting them counted the ones inside strings and
 *     comments too, so a `)` in a message could end a transaction's body early
 *     and hide every database escape after it.
 *
 * The parser knows where a call ends, which of its arguments is a callback, and
 * which text is a string. None of those are things to re-derive by hand.
 */

export type Mutation = {
  name: string
  /** The whole procedure, for reporting. */
  text: string
  /** Does it open through `enterGameplay…`? */
  opensLock: boolean
  /** Writes performed before the lock is taken. */
  writesBeforeLock: string[]
  /** Uses of the global client inside the transaction that holds the lock. */
  escapes: string[]
  /** A second `db.$transaction` nested inside the locked one. */
  nestedTransaction: boolean
  /** Helpers called inside the lock that reach the database on their own. */
  escapingHelpers: string[]
  /** Uses of the transaction client *outside* the transaction it belongs to. */
  recoveryOnTx: string[]
}

/**
 * Engine helpers that take no client and so use the global one.
 *
 * Calling one of these inside a locked transaction escapes it on both counts:
 * their writes land on another connection, outside the lock and outside the
 * caller's rollback, and they can block on rows the calling transaction has
 * changed but not yet committed - which is a deadlock with itself, resolved
 * only when the transaction times out.
 *
 * `completeStep` did exactly that, and both halves were reproduced. The scan
 * does not follow calls into helpers, so the ones that cannot be handed a
 * transaction are listed instead.
 */
const ESCAPING_HELPERS = new Set([
  "deleteAnimalsWithChildren",
  "pruneAnimalData",
  "restockShop",
])

const LOCK_CALLS = /^enterGameplay[A-Za-z]*$/
const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
])

function parse(source: string, fileName: string): ts.SourceFile {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
}

/** `db.something.create` and friends — a call on the global client. */
function globalClientCall(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  let expression = node.expression
  while (ts.isPropertyAccessExpression(expression)) {
    if (ts.isIdentifier(expression.expression) && expression.expression.text === "db") {
      return `db.${expression.name.text}`
    }
    expression = expression.expression
  }
  return null
}

function isTransactionCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "db" &&
    node.expression.name.text === "$transaction"
  )
}

/**
 * Any `$transaction` call, on any client.
 *
 * `tx.$transaction(...)` typechecks — Prisma's interactive transaction client
 * keeps the method in its type and refuses it at runtime — so the compiler will
 * not catch one left behind by a conversion. Nesting on `db` opens a second
 * connection outside the lock; nesting on `tx` just throws. Both are reported.
 */
function isAnyTransactionCall(node: ts.Node): node is ts.CallExpression {
  return (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "$transaction"
  )
}

function isLockCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    LOCK_CALLS.test(node.expression.text)
  )
}

/** A write through any client — `tx.x.create(...)` or `db.x.create(...)`. */
function writeCall(node: ts.Node): string | null {
  if (!ts.isCallExpression(node)) return null
  const target = node.expression
  if (!ts.isPropertyAccessExpression(target)) return null
  return WRITE_METHODS.has(target.name.text) ? target.name.text : null
}

function find<T extends ts.Node>(root: ts.Node, pick: (n: ts.Node) => n is T): T[] {
  const found: T[] = []
  const walk = (n: ts.Node): void => {
    if (pick(n)) found.push(n)
    n.forEachChild(walk)
  }
  walk(root)
  return found
}

function first(root: ts.Node, matches: (n: ts.Node) => boolean): ts.Node | null {
  let found: ts.Node | null = null
  const walk = (n: ts.Node): void => {
    if (found) return
    if (matches(n)) {
      found = n
      return
    }
    n.forEachChild(walk)
  }
  walk(root)
  return found
}

/**
 * Whether an expression is `someProcedure.…​.mutation(…)`.
 *
 * Walked as a chain rather than searched, because `group: router({ … })` holds
 * mutations too: looking anywhere inside the initializer reports the *router*
 * as a mutation and then stops descending, which hides every procedure in it.
 * The chain has to start at a procedure builder and end at `.mutation`.
 */
function isProcedureMutation(expression: ts.Expression): boolean {
  let node: ts.Node = expression
  let sawMutation = false

  for (;;) {
    if (ts.isCallExpression(node)) {
      node = node.expression
      continue
    }
    if (ts.isPropertyAccessExpression(node)) {
      if (node.name.text === "mutation") sawMutation = true
      node = node.expression
      continue
    }
    break
  }

  return sawMutation && ts.isIdentifier(node) && node.text.endsWith("Procedure")
}

/**
 * Every `.mutation(...)` procedure in a router file.
 *
 * A procedure is a property whose value is a chain ending in `.mutation(...)`,
 * at any depth — nested routers included, which is how nine of these hid.
 */
export function mutationsIn(source: string, fileName = "router.ts"): Mutation[] {
  const file = parse(source, fileName)
  const out: Mutation[] = []

  const walk = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      isProcedureMutation(node.initializer)
    ) {
      out.push(describe(node.name.text, node, file))
      return
    }
    node.forEachChild(walk)
  }

  file.forEachChild(walk)
  return out
}

function describe(name: string, node: ts.Node, file: ts.SourceFile): Mutation {
  const text = node.getText(file)
  const lock = first(node, isLockCall)

  if (!lock) {
    return {
      name,
      text,
      opensLock: false,
      writesBeforeLock: [],
      escapes: [],
      nestedTransaction: false,
      escapingHelpers: [],
      recoveryOnTx: [],
    }
  }

  // Writes that happen before the lock, anywhere in the procedure.
  const writesBeforeLock = find(node, (n): n is ts.CallExpression => writeCall(n) !== null)
    .filter((call) => call.getStart(file) < lock.getStart(file))
    .map((call) => `${writeCall(call)} at line ${file.getLineAndCharacterOfPosition(call.getStart(file)).line + 1}`)

  // The transaction that actually holds the lock: the innermost `db.$transaction`
  // call whose callback contains it.
  const holding = find(node, isTransactionCall).filter((call) => {
    const start = call.getStart(file)
    return start <= lock.getStart(file) && lock.getEnd() <= call.getEnd()
  })
  const owner = holding[holding.length - 1]

  const escapes: string[] = []
  const escapingHelpers: string[] = []
  let nestedTransaction = false

  if (owner) {
    const callback = owner.arguments[0]
    if (callback) {
      for (const call of find(callback, (n): n is ts.CallExpression => ts.isCallExpression(n))) {
        if (isAnyTransactionCall(call)) {
          nestedTransaction = true
          continue
        }
        if (ts.isIdentifier(call.expression) && ESCAPING_HELPERS.has(call.expression.text)) {
          const line = file.getLineAndCharacterOfPosition(call.getStart(file)).line + 1
          escapingHelpers.push(`${call.expression.text} at line ${line}`)
          continue
        }

        const global = globalClientCall(call)
        if (global) {
          const line = file.getLineAndCharacterOfPosition(call.getStart(file)).line + 1
          escapes.push(`${global} at line ${line}`)
        }
      }
    }
  }

  // Anything still talking to `tx` after its transaction has closed.
  //
  // This is the shape of a duplicate-key recovery written in the obvious place:
  // catch the collision, then ask the database whether the row already exists.
  // By then Postgres has aborted the transaction and refuses every further
  // statement, so the recovery fails along with the thing it was recovering
  // from. Both `grantStartingGold` and `returnMare` were written that way.
  //
  // Checked structurally because the race itself cannot be forced reliably
  // through the public route - whether two requests collide depends on pool
  // and timing, so a concurrency test can pass with this broken.
  //
  // This finds only half the shape. A catch written *inside* the transaction
  // callback is lexically where it belongs and still queries a dead
  // transaction, and there is no way to tell that apart from the many
  // legitimate catches inside one. `recovery-after-rollback.test.ts` covers
  // that half, by injecting the duplicate key and poisoning the transaction
  // client the way Postgres does.
  const recoveryOnTx: string[] = []
  if (owner) {
    for (const access of find(node, (n): n is ts.PropertyAccessExpression =>
      ts.isPropertyAccessExpression(n)
    )) {
      if (!ts.isIdentifier(access.expression) || access.expression.text !== "tx") continue
      const at = access.getStart(file)
      if (at >= owner.getStart(file) && at <= owner.getEnd()) continue
      recoveryOnTx.push(
        `tx.${access.name.text} at line ${file.getLineAndCharacterOfPosition(at).line + 1}`
      )
    }
  }

  return {
    name,
    text,
    opensLock: true,
    writesBeforeLock,
    escapes,
    nestedTransaction,
    escapingHelpers,
    recoveryOnTx,
  }
}
