import { useState, useEffect, useRef } from "react"
import { Bell, BookOpen, MessageCircle, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useMessagingSocket, useSocketEvent } from "@/lib/messaging/socket-events"
import { Avatar, ChatSection, type ChatDestination } from "@/components/messaging/chat-section"
import { Conversation } from "@/components/messaging/conversation"
import { findConversation } from "@/components/messaging/targets"

type Notification = RouterOutputs["notification"]["list"][number]
type TutorialProgress = RouterOutputs["tutorial"]["getProgress"]

// One rail, one list of destinations. Servers sit below direct messages in the
// same column as the tutorial and notifications rather than opening a second
// rail inside the chat pane — the widget already has a sidebar, so a server is
// another button on it.
type Section = { kind: "tutorial" } | { kind: "notifications" } | ChatDestination

// Which panel is showing, if any. One at a time: these are 400px wide on a
// viewport that is often not much more than twice that, so two side by side
// would leave neither usable.
type OpenPanel = { kind: "main" } | { kind: "conversation"; channelId: string } | null

type Edge = "left" | "right"
type ResizeDir = "top" | "side" | "corner"

// Geometry of the dock. Every bubble stands on one of the two side edges at its
// own height, and the panel opens inboard of whichever bubble it belongs to.
const BUBBLE = 56 // h-14 w-14
const BUBBLE_GAP = 8
const MARGIN = 24 // breathing room between a bubble and the viewport edge
const PANEL_GAP = 8 // between a bubble and the panel beside it
const MIN_PANEL_W = 280
const MIN_PANEL_H = 200
const MAX_PANEL_W = 700
const MAX_PANEL_H = 850

// Bubbles are placed free-hand but land on a slot, one bubble tall plus its
// gap. Snapping on release is what stops two of them half-covering each other:
// a dropped bubble takes the nearest slot that is empty, so they tidy
// themselves into a column without ever being locked into one.
const SLOT = BUBBLE + BUBBLE_GAP

// How many conversations may have a bubble at once. A cap rather than a
// viewport calculation: deriving it from the height would silently close
// somebody's chat when the window got shorter, which is worse than a limit that
// behaves the same every time.
const MAX_POPPED = 4

// The widget's own bubble, in the same placement map as the conversations. It
// is not special — it can be moved, and anything that holds a position holds it
// the same way.
const MAIN = "main"

type Placement = { edge: Edge; slot: number }

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high))
}

// Two letters rather than a generic hash, so one channel bubble is not
// indistinguishable from the next. A hyphenated name gives its initials —
// testing-feedback becomes TF — and a single word gives its first two.
function monogram(name: string): string {
  const words = name.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  const first = words[0] ?? name
  const second = words[1]
  if (second) return (first.slice(0, 1) + second.slice(0, 1)).toUpperCase()
  return first.slice(0, 2).toUpperCase()
}

// The dock is positioned against the viewport rather than inside a layout, so
// it has to know how big the viewport is to stay within it.
function useViewport() {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1024 : window.innerWidth,
    h: typeof window === "undefined" ? 768 : window.innerHeight,
  }))
  useEffect(() => {
    const onResize = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])
  return size
}

function relativeTime(date: Date | string): string {
  const ms = Date.now() - new Date(date).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function MessagingWidget() {
  const { data: game } = trpc.admin.game.get.useQuery()
  const gameId = game?.id

  const { data: player } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const tutorialCompleted = player?.seniority?.tutorialCompleted ?? false

  const { data: notifications = [], refetch: refetchNotifications } =
    trpc.notification.list.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const notifUnread = notifications.filter(n => !n.isRead).length

  // Opens the socket and claims the game on it. Mounted here because the widget
  // lives for the whole authenticated tree, so the connection's lifetime
  // matches being signed in — which is what the server's revocation checks
  // assume. endClientSession closes it again on sign-out.
  const connection = useMessagingSocket(gameId)

  // The same query the chat section runs, so React Query serves both from one
  // request. The rail needs it split by destination: one badge for direct
  // messages, one per server. The dock also resolves its bubbles out of it.
  const { data: messagingOverview } = trpc.messaging.overview.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const chatServer = messagingOverview?.server ?? null
  const directUnread =
    messagingOverview?.directMessages.reduce((sum, dm) => sum + dm.unreadCount, 0) ?? 0
  const serverUnread =
    messagingOverview?.channels.reduce((sum, channel) => sum + channel.unreadCount, 0) ?? 0
  const totalUnread = notifUnread + (messagingOverview?.totalUnread ?? 0)

  const { data: tutorialData } = trpc.tutorial.getProgress.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && !tutorialCompleted }
  )

  const viewport = useViewport()

  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [activeSection, setActiveSection] = useState<Section>({ kind: "notifications" })
  // Newest first, so the most recently opened conversation sits nearest the
  // main bubble.
  const [popped, setPopped] = useState<string[]>([])
  // Where each bubble lives, keyed by MAIN or a channel id.
  const [placements, setPlacements] = useState<Record<string, Placement>>({
    [MAIN]: { edge: "right", slot: 0 },
  })
  // The bubble currently under the pointer, at its free-hand position. Separate
  // from `placements` so a drag in progress is never mistaken for a resting
  // place, and abandoning one leaves nothing behind.
  const [drag, setDrag] = useState<{ key: string; edge: Edge; bottom: number } | null>(null)
  const [size, setSize] = useState({ w: 400, h: 400 })

  const dragInfo = useRef<{ key: string; mx: number; my: number; bottom: number; moved: boolean } | null>(
    null
  )

  const isResizing = useRef(false)
  const resizeInfo = useRef({ dir: "corner" as ResizeDir, mx: 0, my: 0, w: 0, h: 0 })

  useEffect(() => {
    if (tutorialCompleted && activeSection.kind === "tutorial") {
      setActiveSection({ kind: "notifications" })
    }
  }, [tutorialCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent("notification:created", () => void refetchNotifications())

  // Resolved every render rather than stored, so a bubble's name, face and
  // unread count stay current — and one whose conversation has gone away stops
  // being drawn instead of opening an empty panel.
  const bubbles = popped
    .map(channelId => findConversation(messagingOverview, channelId))
    .filter((found): found is NonNullable<typeof found> => found !== null)

  // Everything below is clamped at render rather than when it is set. A window
  // resize can invalidate a position that was legal when it was chosen, and
  // correcting it here means there is no state to keep in step.
  const topSlot = Math.max(0, Math.floor((viewport.h - 2 * MARGIN - BUBBLE) / SLOT))

  function positionOf(key: string): { edge: Edge; bottom: number } {
    if (drag?.key === key) return { edge: drag.edge, bottom: drag.bottom }
    const placed = placements[key] ?? { edge: "right" as Edge, slot: 0 }
    return { edge: placed.edge, bottom: MARGIN + clamp(placed.slot, 0, topSlot) * SLOT }
  }

  // The nearest slot to `desired` that nothing else is standing on. Searched
  // outwards in both directions so a bubble dropped onto an occupied slot
  // settles beside it rather than jumping to the end of the queue.
  function nearestFreeSlot(edge: Edge, desired: number, forKey: string): number {
    const taken = new Set(
      [MAIN, ...popped]
        .filter(key => key !== forKey)
        .map(key => placements[key])
        .filter((placed): placed is Placement => placed?.edge === edge)
        .map(placed => clamp(placed.slot, 0, topSlot))
    )
    const start = clamp(desired, 0, topSlot)
    for (let step = 0; step <= topSlot; step++) {
      if (start + step <= topSlot && !taken.has(start + step)) return start + step
      if (start - step >= 0 && !taken.has(start - step)) return start - step
    }
    return start
  }

  const panelInset = MARGIN + BUBBLE + PANEL_GAP
  const panelW = clamp(size.w, MIN_PANEL_W, Math.min(MAX_PANEL_W, viewport.w - panelInset - MARGIN))
  const panelH = clamp(size.h, MIN_PANEL_H, Math.min(MAX_PANEL_H, viewport.h - 2 * MARGIN))

  // The panel hangs off the bubble that opened it: same edge, same line, rising
  // from there, and pulled down only as far as it must be to keep its top on
  // screen. Dragging that bubble carries the panel with it.
  const mainAt = positionOf(MAIN)
  const anchor = openPanel?.kind === "conversation" ? positionOf(openPanel.channelId) : mainAt
  const panelBottom = clamp(anchor.bottom, MARGIN, viewport.h - MARGIN - panelH)

  function onPointerDown(key: string, e: React.PointerEvent<HTMLElement>) {
    dragInfo.current = {
      key,
      mx: e.clientX,
      my: e.clientY,
      bottom: positionOf(key).bottom,
      moved: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const info = dragInfo.current
    if (!info) return
    // The press ended somewhere we never heard about: released outside the
    // window, or cancelled by the browser mid-gesture. Without this the bubble
    // keeps chasing the cursor on every hover and can never be clicked again,
    // because it is always moving out from under the pointer.
    if (e.buttons === 0) {
      dragInfo.current = null
      setDrag(null)
      return
    }
    const dx = e.clientX - info.mx
    const dy = e.clientY - info.my
    // Nothing moves until the press is unmistakably a drag. A bubble that
    // shifted on mousedown would slide out from under the cursor, and the
    // mouseup would then land on the page behind it.
    if (!info.moved && Math.abs(dx) <= 3 && Math.abs(dy) <= 3) return
    info.moved = true

    // Carried by how far the pointer has travelled, not by where it is, so the
    // bubble keeps the offset it was grabbed at instead of jumping to centre
    // itself on the cursor.
    //
    // Held against an edge throughout rather than released to one, so it never
    // sits anywhere it would not stay. Which edge is decided by the pointer,
    // not the bubble, so crossing the middle flips it.
    setDrag({
      key: info.key,
      edge: e.clientX < viewport.w / 2 ? "left" : "right",
      bottom: clamp(info.bottom - dy, MARGIN, viewport.h - MARGIN - BUBBLE),
    })
  }

  // Opening is decided here rather than in onClick. If the pointer moves at all
  // between press and release — and a real mouse usually does — the browser
  // retargets the click to the nearest ancestor of the two, so a handler on the
  // button itself can simply never run. Pointerup always arrives at the element
  // holding capture.
  function onPointerUp(onTap: () => void) {
    const info = dragInfo.current
    dragInfo.current = null
    if (!info) return
    if (!info.moved) {
      onTap()
      return
    }
    // Free while held, slotted once dropped.
    const landed = drag
    setDrag(null)
    if (!landed || landed.key !== info.key) return
    const desired = Math.round((landed.bottom - MARGIN) / SLOT)
    const slot = nearestFreeSlot(landed.edge, desired, info.key)
    setPlacements(current => ({ ...current, [info.key]: { edge: landed.edge, slot } }))
  }

  function onPointerCancel() {
    dragInfo.current = null
    setDrag(null)
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, dir: ResizeDir) {
    e.stopPropagation()
    isResizing.current = true
    resizeInfo.current = { dir, mx: e.clientX, my: e.clientY, w: panelW, h: panelH }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function doResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing.current) return
    const { dir, mx, my, w, h } = resizeInfo.current
    // The panel grows away from the edge it is docked against, so the handle
    // that widens it is on its left when docked right and on its right when
    // docked left. One sign flip covers both.
    const widen = (anchor.edge === "right" ? -1 : 1) * (e.clientX - mx)
    const taller = my - e.clientY
    setSize({
      w: dir === "side" || dir === "corner" ? clamp(w + widen, MIN_PANEL_W, MAX_PANEL_W) : w,
      h: dir === "top" || dir === "corner" ? clamp(h + taller, MIN_PANEL_H, MAX_PANEL_H) : h,
    })
  }

  function endResize() {
    isResizing.current = false
  }

  // Opening a conversation gives it a bubble and shows it. Already-docked ones
  // are moved to the front and keep where they were put, rather than being
  // added twice or jumping back to the default spot.
  function popOut(channelId: string) {
    const next = [channelId, ...popped.filter(id => id !== channelId)].slice(0, MAX_POPPED)
    const evicted = popped.filter(id => !next.includes(id))
    const main = placements[MAIN] ?? { edge: "right" as Edge, slot: 0 }
    const existing = placements[channelId]
    // Straight above the widget's own bubble, or the nearest free slot to it.
    const placed = existing ?? {
      edge: main.edge,
      slot: nearestFreeSlot(main.edge, main.slot + 1, channelId),
    }

    setPopped(next)
    setPlacements(current => {
      const updated = { ...current, [channelId]: placed }
      for (const id of evicted) delete updated[id]
      return updated
    })
    setOpenPanel({ kind: "conversation", channelId })
  }

  function closeBubble(channelId: string) {
    setPopped(list => list.filter(id => id !== channelId))
    // Dropped too, so the slot it was standing on is free again.
    setPlacements(current => {
      const updated = { ...current }
      delete updated[channelId]
      return updated
    })
    setOpenPanel(current =>
      current?.kind === "conversation" && current.channelId === channelId ? null : current
    )
  }

  function toggle(panel: NonNullable<OpenPanel>) {
    setOpenPanel(current => {
      if (current?.kind === "main" && panel.kind === "main") return null
      if (
        current?.kind === "conversation" &&
        panel.kind === "conversation" &&
        current.channelId === panel.channelId
      ) {
        return null
      }
      return panel
    })
  }

  const sectionLabel =
    activeSection.kind === "tutorial"
      ? "Tutorial"
      : activeSection.kind === "notifications"
        ? "Notifications"
        : activeSection.kind === "dms"
          ? "Direct messages"
          : (chatServer?.name ?? "Channels")

  const openConversation =
    openPanel?.kind === "conversation"
      ? (bubbles.find(bubble => bubble.target.channelId === openPanel.channelId) ?? null)
      : null

  return (
    // Covers the viewport so everything the dock draws is inside the element
    // the tutorial's click guard allowlists, without intercepting clicks meant
    // for the page underneath.
    <div data-tutorial-messaging className="pointer-events-none fixed inset-0 z-50">
      {openPanel && (
        <div
          className="pointer-events-auto absolute flex overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          style={{ [anchor.edge]: panelInset, bottom: panelBottom, width: panelW, height: panelH }}
        >
          {/* Resize handles, on the two edges the panel grows towards: the top,
              and whichever side faces away from the viewport edge. */}
          <div
            className="absolute inset-x-3 top-0 z-10 h-1 cursor-ns-resize rounded-full hover:bg-primary/15"
            onPointerDown={e => startResize(e, "top")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />
          <div
            className={[
              "absolute inset-y-3 z-10 w-1 cursor-ew-resize rounded-full hover:bg-primary/15",
              anchor.edge === "right" ? "left-0" : "right-0",
            ].join(" ")}
            onPointerDown={e => startResize(e, "side")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />
          <div
            className={[
              "absolute top-0 z-10 h-3 w-3 cursor-nwse-resize hover:bg-primary/15",
              anchor.edge === "right" ? "left-0 rounded-br" : "right-0 rounded-bl",
            ].join(" ")}
            onPointerDown={e => startResize(e, "corner")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />

          {openPanel.kind === "conversation" ? (
            openConversation && gameId && messagingOverview ? (
              <div className="min-h-0 min-w-0 flex-1">
                <Conversation
                  key={openConversation.target.channelId}
                  gameId={gameId}
                  target={openConversation.target}
                  connection={connection}
                  viewer={messagingOverview.viewer}
                  onBack={null}
                  headerAction={
                    <button
                      onClick={() => setOpenPanel(null)}
                      aria-label="Close"
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  }
                />
              </div>
            ) : (
              <p className="p-3 text-xs text-muted-foreground">Loading…</p>
            )
          ) : (
            <>
              {/* Icon rail */}
              <div className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border bg-muted/40 py-3">
                {!tutorialCompleted && (
                  <RailButton
                    label="Tutorial"
                    active={activeSection.kind === "tutorial"}
                    unread={0}
                    onClick={() => setActiveSection({ kind: "tutorial" })}
                  >
                    <BookOpen className="h-5 w-5" />
                  </RailButton>
                )}

                <RailButton
                  label="Notifications"
                  active={activeSection.kind === "notifications"}
                  unread={notifUnread}
                  onClick={() => setActiveSection({ kind: "notifications" })}
                >
                  <Bell className="h-5 w-5" />
                </RailButton>

                {/* Present during the tutorial too. The tutorial is exactly
                    where a tester finds things worth reporting, so
                    #testing-feedback has to be reachable from inside it — see
                    the [data-tutorial-messaging] exemption in
                    lib/tutorial/access.ts and the matching one in the server's
                    mutation guard. */}
                <RailButton
                  label="Direct messages"
                  active={activeSection.kind === "dms"}
                  unread={directUnread}
                  onClick={() => setActiveSection({ kind: "dms" })}
                >
                  <MessageCircle className="h-5 w-5" />
                </RailButton>

                {/* Servers below, after a divider — the same shape Discord
                    uses, and what makes a second game's server cheap: one more
                    button. */}
                {chatServer && (
                  <>
                    <div className="my-1 h-px w-7 shrink-0 rounded-full bg-border" />
                    <RailButton
                      label={chatServer.name}
                      active={activeSection.kind === "server"}
                      unread={serverUnread}
                      onClick={() => setActiveSection({ kind: "server", serverId: chatServer.id })}
                    >
                      {/* No server artwork exists, so the initial stands in —
                          what Discord falls back to for a server without an
                          icon. */}
                      <span className="text-xs font-bold">
                        {chatServer.name.slice(0, 1).toUpperCase()}
                      </span>
                    </RailButton>
                  </>
                )}
              </div>

              {/* Content pane */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2">
                  <span className="text-xs font-semibold text-foreground">{sectionLabel}</span>
                  <button
                    onClick={() => setOpenPanel(null)}
                    aria-label="Close"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* The chat section scrolls its own history and pins its
                    composer, so it gets the bare pane. The other two are plain
                    lists. */}
                <div
                  className={
                    isChat(activeSection) ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-y-auto p-3"
                  }
                >
                  {activeSection.kind === "tutorial" && <TutorialContent data={tutorialData} />}
                  {activeSection.kind === "notifications" && gameId && (
                    <NotificationsContent
                      notifications={notifications}
                      gameId={gameId}
                      onRefresh={() => void refetchNotifications()}
                    />
                  )}
                  {isChat(activeSection) && gameId && (
                    <ChatSection
                      gameId={gameId}
                      connection={connection}
                      width={panelW}
                      destination={activeSection}
                      onPopOut={popOut}
                    />
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Each bubble stands on its own, at its own place on its own edge. The
          one being dragged is lifted above the rest so it is never hidden
          behind one it is passing. */}
      {bubbles.map(bubble => {
        const channelId = bubble.target.channelId
        const at = positionOf(channelId)
        return (
          <div
            key={channelId}
            className="pointer-events-auto absolute"
            style={{ [at.edge]: MARGIN, bottom: at.bottom, zIndex: drag?.key === channelId ? 2 : 1 }}
          >
            <ConversationBubble
              name={bubble.target.title}
              avatar={bubble.avatar}
              isDirect={bubble.target.isDirect}
              unread={bubble.unreadCount}
              active={openPanel?.kind === "conversation" && openPanel.channelId === channelId}
              onPointerDown={e => onPointerDown(channelId, e)}
              onPointerMove={onPointerMove}
              onPointerUp={() => onPointerUp(() => toggle({ kind: "conversation", channelId }))}
              onPointerCancel={onPointerCancel}
              onKeyActivate={() => toggle({ kind: "conversation", channelId })}
              onClose={() => closeBubble(channelId)}
            />
          </div>
        )
      })}

      <div
        className="pointer-events-auto absolute"
        style={{
          [mainAt.edge]: MARGIN,
          bottom: mainAt.bottom,
          zIndex: drag?.key === MAIN ? 2 : 1,
        }}
      >
        <button
          className="relative flex h-14 w-14 cursor-grab touch-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 transition-transform hover:scale-105 active:cursor-grabbing active:scale-95"
          onPointerDown={e => onPointerDown(MAIN, e)}
          onPointerMove={onPointerMove}
          onPointerUp={() => onPointerUp(() => toggle({ kind: "main" }))}
          onPointerCancel={onPointerCancel}
          onClick={e => {
            // Keyboard only. A click synthesised by Enter or Space reports
            // detail 0, where a real mouse click reports 1 or more — and that
            // one is already handled on pointerup.
            if (e.detail === 0) toggle({ kind: "main" })
          }}
          aria-label="Messages"
        >
          <MessageCircle className="h-6 w-6" />
          {totalUnread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
              {totalUnread > 99 ? "99+" : totalUnread}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

// Both chat destinations render the same pane, so the content area asks this
// rather than listing them twice — and it narrows, so `destination` below is
// known to be one of them.
function isChat(section: Section): section is ChatDestination {
  return section.kind === "dms" || section.kind === "server"
}

// A conversation parked on the edge of the screen, draggable in its own right.
//
// A person gets a circle with their face on it; a channel gets a rounded square
// with two letters, the way Discord separates servers from direct messages. The
// shape says which kind it is and the letters say which one — a bare hash said
// neither, so a column of channels was a column of identical buttons.
function ConversationBubble({
  name,
  avatar,
  isDirect,
  unread,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onKeyActivate,
  onClose,
}: {
  name: string
  avatar: string | null
  isDirect: boolean
  unread: number
  active: boolean
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLElement>) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onKeyActivate: () => void
  onClose: () => void
}) {
  return (
    <div className="group relative">
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={e => {
          if (e.detail === 0) onKeyActivate()
        }}
        title={name}
        aria-label={name}
        className={[
          "flex h-14 w-14 cursor-grab touch-none items-center justify-center bg-card shadow-lg transition-transform hover:scale-105 active:cursor-grabbing",
          isDirect ? "rounded-full" : "rounded-2xl",
          active ? "ring-2 ring-primary" : "ring-1 ring-border",
        ].join(" ")}
      >
        {isDirect ? (
          <Avatar username={name} avatar={avatar} className="h-12 w-12 text-base" />
        ) : (
          <span className="text-sm font-bold tracking-tight text-muted-foreground">
            {monogram(name)}
          </span>
        )}
      </button>

      {unread > 0 && (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
          {unread > 99 ? "99+" : unread}
        </span>
      )}

      {/* Only on hover, so a column of faces does not become a column of close
          buttons. */}
      <button
        onClick={onClose}
        aria-label={`Close ${name}`}
        className="absolute -left-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-muted text-muted-foreground ring-1 ring-border transition-colors hover:bg-destructive hover:text-destructive-foreground group-hover:flex"
      >
        <X className="h-2.5 w-2.5" />
      </button>
    </div>
  )
}

function RailButton({
  label,
  active,
  unread,
  onClick,
  children,
}: {
  label: string
  active: boolean
  unread: number
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      title={label}
      aria-label={label}
      onClick={onClick}
      className={[
        "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      ].join(" ")}
    >
      {children}
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  )
}

function TutorialContent({ data }: { data: TutorialProgress | undefined }) {
  if (!data) return <p className="text-xs text-muted-foreground">Loading…</p>
  if (!data.steps.length)
    return <p className="text-xs text-muted-foreground">No tutorial steps configured.</p>

  const completedIds = new Set(data.progress.map(p => p.stepDefId))

  return (
    <div className="space-y-1">
      <p className="mb-3 text-xs text-muted-foreground">
        {completedIds.size} / {data.steps.length} steps complete
      </p>
      {data.steps.map(step => {
        const done = completedIds.has(step.id)
        return (
          <div
            key={step.id}
            className={[
              "flex items-start gap-2 rounded-md border-l-2 py-2 pl-3 pr-2 text-xs transition-colors",
              done ? "border-primary/40 opacity-50" : "border-primary bg-primary/5",
            ].join(" ")}
          >
            <span
              className={["mt-px shrink-0", done ? "text-primary" : "text-muted-foreground"].join(
                " "
              )}
            >
              {done ? "✓" : "○"}
            </span>
            <div>
              <div className="font-medium leading-tight">{step.name}</div>
              {step.description && (
                <div className="mt-0.5 leading-tight text-muted-foreground">{step.description}</div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function NotificationsContent({
  notifications,
  gameId,
  onRefresh,
}: {
  notifications: Notification[]
  gameId: string
  onRefresh: () => void
}) {
  const markRead = trpc.notification.markRead.useMutation({ onSuccess: onRefresh })
  const markAllRead = trpc.notification.markAllRead.useMutation({ onSuccess: onRefresh })
  const hasUnread = notifications.some(n => !n.isRead)

  if (!notifications.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Bell className="h-8 w-8 opacity-30" />
        <p className="text-xs">No notifications yet.</p>
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {hasUnread && (
        <button
          className="mb-3 block text-xs text-primary hover:underline disabled:opacity-50"
          onClick={() => markAllRead.mutate({ gameId })}
          disabled={markAllRead.isPending}
        >
          Mark all as read
        </button>
      )}
      {notifications.map(n => (
        <div
          key={n.id}
          className={[
            "cursor-pointer rounded-md border-l-2 py-2 pl-3 pr-2 text-xs transition-colors hover:bg-muted",
            !n.isRead ? "border-primary bg-primary/5" : "border-transparent",
          ].join(" ")}
          onClick={() => {
            if (!n.isRead) markRead.mutate({ gameId, notificationId: n.id })
          }}
        >
          <div className="mb-0.5 flex items-center justify-between gap-2">
            {n.topicDef ? (
              <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                {n.topicDef.name}
              </span>
            ) : (
              <span />
            )}
            <span className="text-[9px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
          </div>
          <p className={!n.isRead ? "font-medium text-foreground" : "text-muted-foreground"}>
            {n.content}
          </p>
        </div>
      ))}
    </div>
  )
}
