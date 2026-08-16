import { useState, useEffect, useRef } from "react"
import { Bell, BookOpen, MessageCircle, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { socket } from "@/lib/socket"

type Notification = RouterOutputs["notification"]["list"][number]
type TutorialProgress = RouterOutputs["tutorial"]["getProgress"]
type Section = "tutorial" | "notifications" | "chat"
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

  const { data: tutorialData } = trpc.tutorial.getProgress.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId && !tutorialCompleted }
  )

  const [open, setOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>("notifications")
  const [pos, setPos] = useState({ x: 24, y: 24 })
  const [size, setSize] = useState({ w: 400, h: 400 })

  const isDragging = useRef(false)
  const hasDragged = useRef(false)
  const dragStart = useRef({ mx: 0, my: 0, px: 0, py: 0 })

  const isResizing = useRef(false)
  const resizeInfo = useRef({ dir: "corner" as ResizeDir, mx: 0, my: 0, w: 0, h: 0 })

  useEffect(() => {
    if (tutorialCompleted && activeSection === "tutorial") setActiveSection("notifications")
  }, [tutorialCompleted]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // socket.connect() — deferred until socket server is live
    socket.on("notification", () => { void refetchNotifications() })
    return () => {
      socket.off("notification")
    }
  }, [refetchNotifications])

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

  const navItems = [
    ...(!tutorialCompleted ? [{
      key: "tutorial" as const,
      icon: BookOpen,
      label: "Tutorial",
      badge: null as number | null,
    }] : []),
    {
      key: "notifications" as const,
      icon: Bell,
      label: "Notifications",
      badge: notifUnread > 0 ? notifUnread : null,
    },
    ...(tutorialCompleted ? [{
      key: "chat" as const,
      icon: MessageCircle,
      label: "Messages",
      badge: null as number | null,
    }] : []),
  ]

  const sectionLabel = navItems.find(n => n.key === activeSection)?.label ?? ""

  return (
    <div className="fixed z-50" style={{ right: pos.x, bottom: pos.y }}>
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
          <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/40 py-3">
            {navItems.map(({ key, icon: Icon, label, badge }) => (
              <button
                key={key}
                title={label}
                onClick={() => setActiveSection(key)}
                className={[
                  "relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
                  activeSection === key
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" />
                {badge !== null && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </button>
            ))}
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

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {activeSection === "tutorial" && (
                <TutorialContent data={tutorialData} />
              )}
              {activeSection === "notifications" && gameId && (
                <NotificationsContent
                  notifications={notifications}
                  gameId={gameId}
                  onRefresh={() => void refetchNotifications()}
                />
              )}
              {activeSection === "chat" && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <MessageCircle className="h-8 w-8 opacity-30" />
                  <p className="text-xs">Direct messages coming soon.</p>
                </div>
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
        {notifUnread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
            {notifUnread > 99 ? "99+" : notifUnread}
          </span>
        )}
      </button>
    </div>
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
