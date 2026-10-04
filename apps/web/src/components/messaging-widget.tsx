import { useState, useEffect, useRef } from "react"
import { Bell, BookOpen, Hash, MessageCircle, X } from "lucide-react"
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

// Geometry of the dock. The bubbles are a column standing on one edge of the
// viewport; the panel opens inboard of that column, so the column is never
// covered by what it opened.
const BUBBLE = 56 // h-14 w-14
const BUBBLE_GAP = 8
const MARGIN = 24 // breathing room between the column and the viewport edge
const PANEL_GAP = 8 // between the column and the panel beside it
const MIN_PANEL_W = 280
const MIN_PANEL_H = 200
const MAX_PANEL_W = 700
const MAX_PANEL_H = 850

// How many conversations may have a bubble at once. A cap rather than a
// viewport calculation: deriving it from the height would silently close
// somebody's chat when the window got shorter, which is worse than a limit that
// behaves the same every time.
const MAX_POPPED = 4

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high))
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
  const [dock, setDock] = useState<{ edge: Edge; bottom: number }>({
    edge: "right",
    bottom: MARGIN,
  })
  const [size, setSize] = useState({ w: 400, h: 400 })

  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, bottom: 0 })

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
  const columnHeight = BUBBLE + bubbles.length * (BUBBLE + BUBBLE_GAP)
  const bottom = clamp(dock.bottom, MARGIN, viewport.h - MARGIN - columnHeight)

  const panelInset = MARGIN + BUBBLE + PANEL_GAP
  const panelW = clamp(size.w, MIN_PANEL_W, Math.min(MAX_PANEL_W, viewport.w - panelInset - MARGIN))
  const panelH = clamp(size.h, MIN_PANEL_H, Math.min(MAX_PANEL_H, viewport.h - 2 * MARGIN))
  // Sits on the same line as the column and rises from there, pulled down only
  // as far as it must be to keep its top on screen.
  const panelBottom = clamp(bottom, MARGIN, viewport.h - MARGIN - panelH)

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    isDragging.current = true
    hasDragged.current = false
    dragStart.current = { mx: e.clientX, my: e.clientY, bottom }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged.current = true
    // Nothing moves until the press is unmistakably a drag. A bubble that
    // shifted on mousedown would slide out from under the cursor, and the
    // mouseup would then land on the page behind it — so the click that was
    // meant to open the panel would never reach the button.
    if (!hasDragged.current) return

    // Carried by how far the pointer has travelled, not by where it is, so the
    // bubble keeps the offset it was grabbed at instead of jumping to centre
    // itself on the cursor.
    //
    // Snapped to an edge throughout the drag rather than released to one, so it
    // never sits anywhere it would not stay. Which edge is decided by the
    // pointer, not the bubble, so crossing the middle flips it.
    setDock({
      edge: e.clientX < viewport.w / 2 ? "left" : "right",
      bottom: clamp(
        dragStart.current.bottom - dy,
        MARGIN,
        viewport.h - MARGIN - columnHeight
      ),
    })
  }

  function onPointerUp() {
    isDragging.current = false
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
    const widen = (dock.edge === "right" ? -1 : 1) * (e.clientX - mx)
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
  // are moved to the front rather than added twice.
  function popOut(channelId: string) {
    setPopped(list => [channelId, ...list.filter(id => id !== channelId)].slice(0, MAX_POPPED))
    setOpenPanel({ kind: "conversation", channelId })
  }

  function closeBubble(channelId: string) {
    setPopped(list => list.filter(id => id !== channelId))
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
          style={{ [dock.edge]: panelInset, bottom: panelBottom, width: panelW, height: panelH }}
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
              dock.edge === "right" ? "left-0" : "right-0",
            ].join(" ")}
            onPointerDown={e => startResize(e, "side")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />
          <div
            className={[
              "absolute top-0 z-10 h-3 w-3 cursor-nwse-resize hover:bg-primary/15",
              dock.edge === "right" ? "left-0 rounded-br" : "right-0 rounded-bl",
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

      {/* The bubble column. Conversations above, the widget itself at the foot
          — the one that is always there is the one that stays put. */}
      <div
        className="pointer-events-auto absolute flex flex-col items-center gap-2"
        style={{ [dock.edge]: MARGIN, bottom }}
      >
        {[...bubbles].reverse().map(bubble => (
          <ConversationBubble
            key={bubble.target.channelId}
            name={bubble.target.title}
            avatar={bubble.avatar}
            isDirect={bubble.target.isDirect}
            unread={bubble.unreadCount}
            active={openPanel?.kind === "conversation" && openPanel.channelId === bubble.target.channelId}
            onClick={() => toggle({ kind: "conversation", channelId: bubble.target.channelId })}
            onClose={() => closeBubble(bubble.target.channelId)}
          />
        ))}

        <button
          className="relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 transition-transform hover:scale-105 active:cursor-grabbing active:scale-95"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={() => {
            if (hasDragged.current) return
            toggle({ kind: "main" })
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

// A conversation parked on the edge of the screen. Not draggable itself: the
// column moves as a unit from the bubble at its foot, so there is only ever one
// thing to position.
function ConversationBubble({
  name,
  avatar,
  isDirect,
  unread,
  active,
  onClick,
  onClose,
}: {
  name: string
  avatar: string | null
  isDirect: boolean
  unread: number
  active: boolean
  onClick: () => void
  onClose: () => void
}) {
  return (
    <div className="group relative">
      <button
        onClick={onClick}
        title={name}
        aria-label={name}
        className={[
          "flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-lg transition-transform hover:scale-105",
          active ? "ring-2 ring-primary" : "ring-1 ring-border",
        ].join(" ")}
      >
        {isDirect ? (
          <Avatar username={name} avatar={avatar} className="h-10 w-10 text-sm" />
        ) : (
          <Hash className="h-5 w-5 text-muted-foreground" />
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
