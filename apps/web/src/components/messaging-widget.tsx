import { useState, useEffect, useRef } from "react"
import { Bell, BookOpen, MessageCircle, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useMessagingSocket, useSocketEvent } from "@/lib/messaging/socket-events"
import { ChatSection, type ChatDestination } from "@/components/messaging/chat-section"

type Notification = RouterOutputs["notification"]["list"][number]
type TutorialProgress = RouterOutputs["tutorial"]["getProgress"]

// One rail, one list of destinations. Servers sit below direct messages in the
// same column as the tutorial and notifications rather than opening a second
// rail inside the chat pane — the widget already has a sidebar, so a server is
// another button on it.
type Section = { kind: "tutorial" } | { kind: "notifications" } | ChatDestination
type ResizeDir = "top" | "left" | "corner"

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

  const { data: player } = trpc.player.me.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )
  const tutorialCompleted = player?.seniority?.tutorialCompleted ?? false

  const { data: notifications = [], refetch: refetchNotifications } =
    trpc.notification.list.useQuery(
      { gameId: gameId! },
      { enabled: !!gameId }
    )
  const notifUnread = notifications.filter(n => !n.isRead).length

  // Opens the socket and claims the game on it. Mounted here because the widget
  // lives for the whole authenticated tree, so the connection's lifetime
  // matches being signed in — which is what the server's revocation checks
  // assume. endClientSession closes it again on sign-out.
  const connection = useMessagingSocket(gameId)

  // The same query the chat section runs, so React Query serves both from one
  // request. The rail needs it split by destination: one badge for direct
  // messages, one per server. totalUnread still drives the closed bubble.
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

  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>({ kind: "notifications" })
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const [size, setSize] = useState({ w: 400, h: 400 })

  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const isResizing = useRef(false)
  const resizeInfo = useRef({ dir: "corner" as ResizeDir, mx: 0, my: 0, w: 0, h: 0 })

  useEffect(() => {
    if (tutorialCompleted && activeSection.kind === "tutorial") {
      setActiveSection({ kind: "notifications" })
    }
  }, [tutorialCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  useSocketEvent("notification:created", () => void refetchNotifications())

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    isDragging.current = true
    hasDragged.current = false
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!isDragging.current) return
    const dx = e.clientX - dragStart.current.mx
    const dy = e.clientY - dragStart.current.my
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasDragged.current = true
    setPos({
      x: Math.max(4, dragStart.current.px - dx),
      y: Math.max(4, dragStart.current.py - dy),
    })
  }

  function onPointerUp() {
    isDragging.current = false
  }

  function onClickBubble() {
    if (hasDragged.current) return
    setOpen(o => !o)
  }

  function startResize(e: React.PointerEvent<HTMLDivElement>, dir: ResizeDir) {
    e.stopPropagation()
    isResizing.current = true
    resizeInfo.current = { dir, mx: e.clientX, my: e.clientY, w: size.w, h: size.h }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function doResize(e: React.PointerEvent<HTMLDivElement>) {
    if (!isResizing.current) return
    const { dir, mx, my, w, h } = resizeInfo.current
    const dx = e.clientX - mx
    const dy = e.clientY - my
    setSize(prev => ({
      w: (dir === "left" || dir === "corner") ? Math.max(280, Math.min(700, w - dx)) : prev.w,
      h: (dir === "top" || dir === "corner") ? Math.max(200, Math.min(850, h - dy)) : prev.h,
    }))
  }

  function endResize() {
    isResizing.current = false
  }

  const sectionLabel =
    activeSection.kind === "tutorial"
      ? "Tutorial"
      : activeSection.kind === "notifications"
        ? "Notifications"
        : activeSection.kind === "dms"
          ? "Direct messages"
          : (chatServer?.name ?? "Channels")

  return (
    <div data-tutorial-messaging className="fixed z-50" style={{ right: pos.x, bottom: pos.y }}>
      {open && (
        <div
          className="absolute bottom-16 right-0 flex overflow-hidden rounded-lg border border-border bg-card shadow-xl"
          style={{ width: size.w, height: size.h }}
        >
          {/* Resize handles — top edge, left edge, top-left corner */}
          <div
            className="absolute inset-x-3 top-0 h-1 cursor-ns-resize rounded-full hover:bg-primary/15"
            onPointerDown={(e) => startResize(e, "top")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />
          <div
            className="absolute inset-y-3 left-0 w-1 cursor-ew-resize rounded-full hover:bg-primary/15"
            onPointerDown={(e) => startResize(e, "left")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />
          <div
            className="absolute left-0 top-0 h-3 w-3 cursor-nwse-resize rounded-br hover:bg-primary/15"
            onPointerDown={(e) => startResize(e, "corner")}
            onPointerMove={doResize}
            onPointerUp={endResize}
          />

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

            {/* Present during the tutorial too. The tutorial is exactly where a
                tester finds things worth reporting, so #testing-feedback has to
                be reachable from inside it — see the [data-tutorial-messaging]
                exemption in lib/tutorial/access.ts and the matching one in the
                server's mutation guard. */}
            <RailButton
              label="Direct messages"
              active={activeSection.kind === "dms"}
              unread={directUnread}
              onClick={() => setActiveSection({ kind: "dms" })}
            >
              <MessageCircle className="h-5 w-5" />
            </RailButton>

            {/* Servers below, after a divider — the same shape Discord uses,
                and what makes a second game's server cheap: one more button. */}
            {chatServer && (
              <>
                <div className="my-1 h-px w-7 shrink-0 rounded-full bg-border" />
                <RailButton
                  label={chatServer.name}
                  active={activeSection.kind === "server"}
                  unread={serverUnread}
                  onClick={() => setActiveSection({ kind: "server", serverId: chatServer.id })}
                >
                  {/* No server artwork exists, so the initial stands in — what
                      Discord falls back to for a server without an icon. */}
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
                onClick={() => setOpen(false)}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* The chat section scrolls its own history and pins its composer,
                so it gets the bare pane. The other two are plain lists. */}
            <div
              className={
                isChat(activeSection)
                  ? "min-h-0 flex-1"
                  : "min-h-0 flex-1 overflow-y-auto p-3"
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
                  width={size.w}
                  destination={activeSection}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <button
        className="relative flex h-14 w-14 cursor-grab items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/20 transition-transform hover:scale-105 active:cursor-grabbing active:scale-95"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onClick={onClickBubble}
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
  )
}

// Both chat destinations render the same pane, so the content area asks this
// rather than listing them twice — and it narrows, so `destination` below is
// known to be one of them.
function isChat(section: Section): section is ChatDestination {
  return section.kind === "dms" || section.kind === "server"
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
  if (!data.steps.length) return <p className="text-xs text-muted-foreground">No tutorial steps configured.</p>

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
            <span className={["mt-px shrink-0", done ? "text-primary" : "text-muted-foreground"].join(" ")}>
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
            ) : <span />}
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
