import { test } from "node:test"
import assert from "node:assert/strict"
import { createGameSession, type ConnectionSocket } from "../src/lib/messaging/connection.ts"

/**
 * The socket's game session: mount, connect, disconnect, in any order.
 *
 * Worth driving directly because the orders that matter are the ones a browser
 * produces by accident. Two components mounting in the same tick, a `game:enter`
 * still waiting for its acknowledgement when the connection drops, a reconnect
 * landing before the old answer does - none of those are reachable by clicking,
 * and all of them end the same way if they are wrong: a socket that is
 * connected, has entered no game, and has nothing left that will notice.
 *
 * `epoch` is what is being protected. It is the signal that tells the chat
 * widget to refetch its unread counts and the nightly banner to re-read the
 * maintenance window, so an epoch that fails to advance after a reconnect
 * leaves both of them showing whatever they had before the gap.
 */

/** Let every already-resolved promise run its continuations. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

/** A socket whose connects and disconnects the test performs by hand. */
function fakeSocket() {
  const handlers = new Map<string, Array<() => void>>()
  let connected = false
  let connectCalls = 0

  const socket: ConnectionSocket = {
    get connected() {
      return connected
    },
    connect() {
      connectCalls += 1
    },
    on(event, handler) {
      const existing = handlers.get(event)
      if (existing) existing.push(handler)
      else handlers.set(event, [handler])
    },
  }

  const fire = (event: string) => {
    for (const handler of handlers.get(event) ?? []) handler()
  }

  return {
    socket,
    get connectCalls() {
      return connectCalls
    },
    connect() {
      connected = true
      fire("connect")
    },
    drop() {
      connected = false
      fire("disconnect")
    },
    failToConnect() {
      connected = false
      fire("connect_error")
    },
  }
}

/**
 * A `game:enter` the test answers when, and in whichever order, it chooses.
 *
 * Out-of-order is the point: the real one is a Socket.IO acknowledgement with
 * a ten-second timeout behind it, so an enter sent on a connection that then
 * dropped is answered - as a failure - long after a later one has succeeded.
 */
function deferredEnter() {
  const pending: Array<((ok: boolean) => void) | null> = []
  const sent: string[] = []

  const enter = (gameId: string) =>
    new Promise<{ ok: boolean }>((resolve) => {
      sent.push(gameId)
      pending.push((ok) => resolve({ ok }))
    })

  /** Answer the nth `game:enter` that was sent. */
  async function settle(index: number, ok = true): Promise<void> {
    const resolve = pending[index]
    assert.ok(resolve, `no game:enter outstanding at index ${index}`)
    pending[index] = null
    resolve(ok)
    await flush()
  }

  return {
    enter,
    sent,
    settle,
    get outstanding() {
      return pending.filter(Boolean).length
    },
    /** Answer the oldest unanswered one. */
    async answer(ok = true): Promise<void> {
      const index = pending.findIndex(Boolean)
      assert.notEqual(index, -1, "expected a game:enter to be in flight")
      await settle(index, ok)
    },
  }
}

function session() {
  const fake = fakeSocket()
  const entering = deferredEnter()
  return { fake, entering, session: createGameSession(fake.socket, entering.enter) }
}

test("a mount with no connection connects, and enters once the socket is up", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  assert.equal(fake.connectCalls, 1)
  assert.deepEqual(entering.sent, [], "nothing to enter on a socket that is not up")

  fake.connect()
  await flush()
  assert.deepEqual(entering.sent, ["game-1"])
  assert.equal(it.snapshot().status, "connecting")

  await entering.answer()
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 1 })
})

test("two components mounting send one game:enter between them", async () => {
  const { fake, entering, session: it } = session()

  // The chat widget and the nightly banner, in the same tick.
  it.ensure("game-1")
  it.ensure("game-1")
  fake.connect()
  await flush()

  // Two would be worse than wasteful: the server answers `game:enter` by
  // leaving the game's rooms and rejoining them, so the second would evict the
  // first from the rooms it had just joined.
  assert.deepEqual(entering.sent, ["game-1"])

  await entering.answer()
  // And a third mount, now that it is online, asks for nothing at all.
  it.ensure("game-1")
  await flush()
  assert.deepEqual(entering.sent, ["game-1"])
  assert.equal(it.snapshot().epoch, 1)
})

test("a reconnect enters again and advances the epoch", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.connect()
  await flush()
  await entering.answer()
  assert.equal(it.snapshot().epoch, 1)

  fake.drop()
  assert.equal(it.snapshot().status, "offline")

  fake.connect()
  await flush()
  await entering.answer()
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 2 })
})

test("an enter left over from a dropped connection cannot override the live one", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.connect()
  await flush()

  // The connection goes away with that enter still in flight, and comes back.
  fake.drop()
  fake.connect()
  await flush()
  assert.equal(entering.outstanding, 2, "the reconnect sends its own")

  // The live one succeeds.
  await entering.settle(1, true)
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 1 })

  // And only then does the one sent on the dead connection time out. Reporting
  // it would leave a connected, entered socket showing "Reconnecting…" with
  // nothing left that would ever correct it - and every epoch-watcher stuck
  // with the data it had before the gap.
  await entering.settle(0, false)
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 1 })
})

test("a reconnect is entered even while an older enter is still unanswered", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.connect()
  await flush()

  fake.drop()
  fake.connect()
  await flush()

  // Nothing may treat the outstanding one as "already entering". It was sent
  // on a socket that no longer exists, and the server has no record of it.
  assert.deepEqual(entering.sent, ["game-1", "game-1"])
})

test("switching games enters the new one and ignores the old answer", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.connect()
  await flush()

  it.ensure("game-2")
  await flush()
  assert.deepEqual(entering.sent, ["game-1", "game-2"])

  // game-1's answer arrives after the switch. Publishing it would say we are
  // online in a game this socket has already been moved out of.
  await entering.settle(0, true)
  assert.equal(it.snapshot().status, "connecting", "still waiting on game-2")

  await entering.settle(1, true)
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 1 })
})

test("a refused enter is reported as offline rather than retried for ever", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.connect()
  await flush()
  await entering.answer(false)

  // Banned, or no character in this game. A real answer, and not one another
  // attempt would change.
  assert.deepEqual(it.snapshot(), { status: "offline", epoch: 0 })
})

test("a failed connection attempt is reported, and a later connect still enters", async () => {
  const { fake, entering, session: it } = session()

  it.ensure("game-1")
  fake.failToConnect()
  assert.equal(it.snapshot().status, "offline")
  assert.deepEqual(entering.sent, [])

  fake.connect()
  await flush()
  await entering.answer()
  assert.deepEqual(it.snapshot(), { status: "online", epoch: 1 })
})

test("watchers are told about every change and nothing after they leave", async () => {
  const { fake, entering, session: it } = session()

  let seen = 0
  const stop = it.watch(() => { seen += 1 })

  it.ensure("game-1")
  fake.connect()
  await flush()
  await entering.answer()
  assert.ok(seen > 0, "a watcher hears the connection come up")

  const before = seen
  stop()
  fake.drop()
  assert.equal(seen, before, "and nothing once it has stopped watching")
})
