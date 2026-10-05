import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ArrowLeft, Hash, Lock, Megaphone, Pencil, Trash2, User } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import {
  joinChannel,
  leaveChannel,
  sendMessage,
  toChatMessage,
  useSocketEvent,
  type ChatMessage,
  type MessagingConnection,
} from "@/lib/messaging/socket-events"

type Viewer = RouterOutputs["messaging"]["overview"]["viewer"]

// What the pane needs to draw a conversation, whichever kind it is. A channel
// and a DM differ in almost everything the sidebar cares about and in almost
// nothing this pane does — so they are flattened here rather than branched on
// throughout. `isDirect` survives only because the two are addressed
// differently in copy: you message #general, but you message Annie.
export type ConversationTarget = {
  channelId: string
  title: string
  isDirect: boolean
  isAnnouncement: boolean
  description: string | null
  isArchived: boolean
  canPost: boolean
  cannotPostReason: string | null
  // The username to link the header to, for a conversation with a person.
  // Carried separately rather than reusing `title`, which only happens to be
  // the same string today — a nickname or a display name would quietly break
  // a link built out of it.
  profileUsername: string | null
}
// `createdAt` is a string, not a Date, because there is no superjson
// transformer on this client — the server's HistoryCursor says Date, and what
// arrives over the wire is an ISO string. Holding it as what it actually is
// keeps the lie out of the client; the conversion back happens at the one place
// that sends it, where the router coerces it anyway.
type HistoryCursor = { createdAt: string; id: string }

// Messages from the same person inside this window share one header, the way
// every chat client does it. Long enough to group a burst of typing, short
// enough that a reply hours later still gets its own name and time.
const GROUP_WINDOW_MS = 5 * 60 * 1000

// How close to the top counts as "show me more".
const LOAD_OLDER_THRESHOLD_PX = 80

// How close to the bottom counts as "following the conversation". Someone
// reading back through history should not get yanked down by a new message, and
// should not have it marked read on their behalf either.
const AT_BOTTOM_THRESHOLD_PX = 60

// Marking read on every arriving message would be a mutation per message. This
// collapses a burst into one write.
const MARK_READ_DEBOUNCE_MS = 400

// The hover row on a message. Absent entirely when the viewer can do neither
// thing, so an empty strip never appears.
//
// Edit is gated on the same canPost the composer uses, because the server gates
// it the same way: editMessage runs evaluatePosting, so a read-only or archived
// channel refuses an edit. One condition for both means the button and the
// composer can never disagree — and when that rule is revisited, they change
// together.
//
// Delete is deliberately *not* gated on canPost. deleteMessage skips the
// posting check on purpose: moderation has to keep working in a channel that
// was archived precisely because it went wrong.
// No confirmation step. There was one, and it was worse than nothing: a strip
// small enough to scroll past, which left the delete half-done and the whole
// gesture to repeat. The control it guards is a 12px icon that has to be aimed
// for, so reaching it is close to always deliberate — and deleting is a
// tombstone rather than an erasure, since deleteMessage leaves the original
// text on the row. An accident is recoverable; a confirmation nobody can see is
// not worth the step.
function MessageActions({
  canEdit,
  canDelete,
  busy,
  onEdit,
  onDelete,
}: {
  canEdit: boolean
  canDelete: boolean
  busy: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  if (!canEdit && !canDelete) return null
  return (
    <div className="absolute right-0 top-0 hidden gap-0.5 rounded border border-border bg-card px-1 py-0.5 shadow-sm group-hover:flex">
      {canEdit && (
        <button
          onClick={onEdit}
          disabled={busy}
          aria-label="Edit message"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
      {canDelete && (
        <button
          onClick={onDelete}
          disabled={busy}
          aria-label="Delete message"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

// Editing happens in place rather than in the composer, so the message keeps
// its position and the surrounding conversation stays readable while you work.
function MessageEditor({
  value,
  busy,
  onChange,
  onCancel,
  onSave,
}: {
  value: string
  busy: boolean
  onChange: (next: string) => void
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <div className="mt-0.5">
      <textarea
        value={value}
        autoFocus
        rows={2}
        disabled={busy}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCancel()
          }
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
            event.preventDefault()
            onSave()
          }
        }}
        className="w-full resize-none rounded-md border border-primary bg-background px-2 py-1 text-xs text-foreground outline-none"
      />
      <p className="text-[9px] text-muted-foreground">
        Enter to save · Escape to cancel
      </p>
    </div>
  )
}

// Inserts or replaces a message, keeping the list in (createdAt, id) order.
//
// The same message can arrive twice: the sender gets it once as the
// acknowledgement of their own send and once as the broadcast to the channel
// room, in either order. Both are matched here — by id for anything already
// saved, and by clientMessageId for the optimistic bubble that has no id yet.
function upsertMessage(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const existing = list.findIndex(
    message =>
      message.id === incoming.id ||
      (message.pending === true && message.clientMessageId === incoming.clientMessageId)
  )
  if (existing !== -1) {
    const next = [...list]
    next[existing] = incoming
    return next
  }

  // Overwhelmingly the common case: the newest message belongs at the end.
  const last = list.at(-1)
  if (!last || last.createdAt <= incoming.createdAt) return [...list, incoming]

  const at = list.findIndex(message => message.createdAt > incoming.createdAt)
  return [...list.slice(0, at), incoming, ...list.slice(at)]
}

function sameDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString()
}

function dayLabel(iso: string): string {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return "Today"
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
}

function targetIcon(target: ConversationTarget) {
  if (target.isDirect) return User
  if (target.isArchived) return Lock
  return target.isAnnouncement ? Megaphone : Hash
}

export function Conversation({
  gameId,
  target,
  connection,
  viewer,
  onBack,
  headerAction = null,
}: {
  gameId: string
  target: ConversationTarget
  connection: MessagingConnection
  viewer: Viewer
  // Null in the wide layout, where the list is already on screen and there is
  // nothing to go back to.
  onBack: (() => void) | null
  // Parked at the right of the header. Inside the widget it pops the
  // conversation out into its own bubble; inside a popped window it closes it.
  // A slot rather than two booleans, because this pane does not care which.
  headerAction?: React.ReactNode
}) {
  const utils = trpc.useUtils()
  const markRead = trpc.messaging.markRead.useMutation({
    onSuccess: () => void utils.messaging.overview.invalidate(),
  })

  // Both land twice: once as the mutation's own answer, once as the broadcast
  // to the channel room. upsertMessage matches on id, so the second is a no-op
  // — and the broadcast is what updates everyone else.
  const edit = trpc.messaging.edit.useMutation({
    onSuccess: saved => {
      setMessages(list => upsertMessage(list, toChatMessage(saved)))
      setEditingId(null)
    },
  })
  const remove = trpc.messaging.remove.useMutation({
    onSuccess: saved => setMessages(list => upsertMessage(list, toChatMessage(saved))),
  })

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [cursor, setCursor] = useState<HistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState("")
  // The message being edited in place, and the text so far. Separate from
  // `draft` so starting an edit does not eat what was half-typed in the
  // composer.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState("")

  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  // Set when older messages are prepended, read once by the layout effect that
  // puts the scroll position back where it was.
  const prependFrom = useRef<number | null>(null)
  const markReadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastMarked = useRef<string | null>(null)

  const channelId = target.channelId

  // Open the conversation: take the channel room so live messages arrive, then
  // load the newest page.
  //
  // Runs again on every epoch change — that is, whenever the socket reconnects
  // and re-enters the game. Room membership does not survive a disconnect, and
  // anything said while the connection was down was never delivered, so both
  // halves have to be redone. This is the reconnect reconciliation: the
  // database is asked again rather than the gap being assumed empty.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    lastMarked.current = null

    void joinChannel(channelId)
    void utils.messaging.history
      .fetch({ gameId, channelId })
      .then(page => {
        if (cancelled) return
        setMessages(page.messages.map(message => toChatMessage(message)))
        setCursor(page.nextCursor)
        atBottom.current = true
      })
      .catch(() => {
        if (!cancelled) setMessages([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
      void leaveChannel(channelId)
    }
  }, [channelId, gameId, connection.epoch, utils])

  useSocketEvent<Parameters<typeof toChatMessage>[0]>("message:created", payload => {
    if (payload.channelId !== channelId) return
    setMessages(list => upsertMessage(list, toChatMessage(payload)))
  })
  useSocketEvent<Parameters<typeof toChatMessage>[0]>("message:updated", payload => {
    if (payload.channelId !== channelId) return
    setMessages(list => upsertMessage(list, toChatMessage(payload)))
  })
  useSocketEvent<Parameters<typeof toChatMessage>[0]>("message:deleted", payload => {
    if (payload.channelId !== channelId) return
    setMessages(list => upsertMessage(list, toChatMessage(payload)))
  })

  const loadOlder = useCallback(async () => {
    if (!cursor || loadingOlder) return
    setLoadingOlder(true)
    const container = scrollRef.current
    prependFrom.current = container ? container.scrollHeight : null
    try {
      const page = await utils.messaging.history.fetch({
        gameId,
        channelId,
        before: cursor === null ? null : { id: cursor.id, createdAt: new Date(cursor.createdAt) },
      })
      setMessages(list => [...page.messages.map(message => toChatMessage(message)), ...list])
      setCursor(page.nextCursor)
    } catch {
      prependFrom.current = null
    } finally {
      setLoadingOlder(false)
    }
  }, [cursor, loadingOlder, gameId, channelId, utils])

  function onScroll() {
    const container = scrollRef.current
    if (!container) return
    atBottom.current =
      container.scrollHeight - container.scrollTop - container.clientHeight < AT_BOTTOM_THRESHOLD_PX
    if (container.scrollTop < LOAD_OLDER_THRESHOLD_PX) void loadOlder()
  }

  // Keeps the view still while older messages are inserted above it. Without
  // this, prepending 50 messages jumps the reader to the top of a page they
  // have already read. A layout effect because it has to happen before the
  // browser paints the new scroll position.
  useLayoutEffect(() => {
    const container = scrollRef.current
    if (!container) return
    if (prependFrom.current !== null) {
      container.scrollTop += container.scrollHeight - prependFrom.current
      prependFrom.current = null
      return
    }
    if (atBottom.current) container.scrollTop = container.scrollHeight
  }, [messages, loading])

  // Move the read pointer to the newest message, but only for someone actually
  // looking at it. Scrolled up through history is reading the past, not the
  // present, and marking it read would clear a badge for messages they have not
  // seen.
  useEffect(() => {
    if (!atBottom.current) return
    const newest = [...messages].reverse().find(message => message.pending !== true)
    if (!newest || newest.id === lastMarked.current) return

    if (markReadTimer.current) clearTimeout(markReadTimer.current)
    markReadTimer.current = setTimeout(() => {
      lastMarked.current = newest.id
      markRead.mutate({ gameId, channelId, lastReadMessageId: newest.id })
    }, MARK_READ_DEBOUNCE_MS)

    return () => {
      if (markReadTimer.current) clearTimeout(markReadTimer.current)
    }
  }, [messages, gameId, channelId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    const content = draft.trim()
    if (content.length === 0) return

    const clientMessageId = crypto.randomUUID()
    const optimistic: ChatMessage = {
      id: `pending-${clientMessageId}`,
      channelId,
      authorPlayerId: viewer.playerAccountId,
      authorUsername: "You",
      clientMessageId,
      content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      removedBy: null,
      pending: true,
    }

    setDraft("")
    atBottom.current = true
    setMessages(list => [...list, optimistic])

    const result = await sendMessage({ channelId, clientMessageId, content })
    if (result.ok) {
      setMessages(list => upsertMessage(list, toChatMessage(result.value)))
      return
    }
    // The bubble stays, carrying the reason. Dropping it would lose what they
    // typed; replacing it with an error toast would lose where it belonged.
    setMessages(list =>
      list.map(message =>
        message.clientMessageId === clientMessageId
          ? { ...message, failed: result.message }
          : message
      )
    )
  }

  const Icon = targetIcon(target)
  const offline = connection.status !== "online"
  const composerMessage = offline
    ? connection.status === "connecting"
      ? "Connecting…"
      : "Reconnecting…"
    : target.cannotPostReason

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        {onBack && (
          <button
            onClick={onBack}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back to channels"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
        )}
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        {target.profileUsername === null ? (
          <span className="truncate text-xs font-semibold text-foreground">{target.title}</span>
        ) : (
          // During the tutorial this still obeys isTutorialRouteAllowed, so a
          // profile the current step disallows bounces back to the dashboard.
          // That is the intended division: the widget's click guard exemption
          // makes messaging usable, route protection decides where it can go.
          <Link
            to="/player/$username"
            params={{ username: target.profileUsername }}
            className="truncate text-xs font-semibold text-foreground underline-offset-2 hover:underline"
          >
            {target.title}
          </Link>
        )}
        {target.description && (
          <span className="hidden truncate text-[10px] text-muted-foreground sm:inline">
            {target.description}
          </span>
        )}
        {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
      </div>

      <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {loading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Nothing here yet. Say something.
          </p>
        ) : (
          <>
            {loadingOlder && (
              <p className="py-2 text-center text-[10px] text-muted-foreground">Loading older…</p>
            )}
            {!loadingOlder && cursor === null && (
              <p className="py-2 text-center text-[10px] text-muted-foreground">
                {target.isDirect
                  ? `The beginning of your conversation with ${target.title}`
                  : `The beginning of #${target.title}`}
              </p>
            )}
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const newDay = !previous || !sameDay(previous.createdAt, message.createdAt)
              const grouped =
                !newDay &&
                previous !== undefined &&
                previous.authorPlayerId === message.authorPlayerId &&
                previous.removedBy === null &&
                message.removedBy === null &&
                new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <
                  GROUP_WINDOW_MS

              return (
                <div key={message.pending === true ? message.clientMessageId : message.id}>
                  {newDay && (
                    <div className="my-2 flex items-center gap-2">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        {dayLabel(message.createdAt)}
                      </span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                  )}
                  <div className={["group relative", grouped ? "" : "mt-2"].join(" ")}>
                    {!grouped && (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-semibold text-foreground">
                          {message.authorUsername}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {timeLabel(message.createdAt)}
                        </span>
                      </div>
                    )}
                    {/* Hover controls. Rendering them is presentation only —
                        editMessage and deleteMessage re-derive the actor from
                        the session and decide again. */}
                    {message.removedBy === null && message.pending !== true && (
                      <MessageActions
                        canEdit={message.authorPlayerId === viewer.playerAccountId && target.canPost}
                        canDelete={
                          message.authorPlayerId === viewer.playerAccountId ||
                          viewer.staffRole !== null
                        }
                        busy={edit.isPending || remove.isPending}
                        onEdit={() => {
                          setEditingId(message.id)
                          setEditDraft(message.content)
                        }}
                        onDelete={() => remove.mutate({ gameId, messageId: message.id })}
                      />
                    )}
                    {editingId === message.id ? (
                      <MessageEditor
                        value={editDraft}
                        busy={edit.isPending}
                        onChange={setEditDraft}
                        onCancel={() => setEditingId(null)}
                        onSave={() => {
                          const content = editDraft.trim()
                          // An edit to nothing is a deletion asked for the
                          // wrong way round. Refusing is kinder than silently
                          // removing their message.
                          if (content.length === 0 || content === message.content) {
                            setEditingId(null)
                            return
                          }
                          edit.mutate({ gameId, messageId: message.id, content })
                        }}
                      />
                    ) : message.removedBy === null ? (
                      <p
                        className={[
                          "whitespace-pre-wrap break-words text-xs leading-snug",
                          message.failed !== undefined
                            ? "text-destructive"
                            : message.pending === true
                              ? "text-muted-foreground"
                              : "text-foreground",
                        ].join(" ")}
                      >
                        {message.content}
                        {message.editedAt !== null && (
                          <span className="ml-1 text-[9px] text-muted-foreground">(edited)</span>
                        )}
                      </p>
                    ) : (
                      // The author and the position stay; only the body is
                      // replaced. The wording lives here rather than in the
                      // database, so it can be changed without rewriting rows.
                      <p className="text-xs italic leading-snug text-muted-foreground">
                        {message.removedBy === "author"
                          ? "— message deleted —"
                          : "— message removed by staff —"}
                      </p>
                    )}
                    {message.failed !== undefined && (
                      <p className="text-[9px] text-destructive">{message.failed}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        {(edit.error ?? remove.error) && (
          <p className="pb-1 text-[10px] text-destructive">
            {(edit.error ?? remove.error)?.message}
          </p>
        )}
        {target.canPost && !offline ? (
          <textarea
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              // Enter sends, Shift+Enter breaks the line. Not while an IME is
              // composing — a Japanese or Korean keyboard uses Enter to accept
              // a candidate, and sending there would cut the word in half.
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={target.isDirect ? `Message ${target.title}` : `Message #${target.title}`}
            className="max-h-24 w-full resize-none rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        ) : (
          // Disabling is presentation, never enforcement: the server check is
          // unchanged and authoritative. A crafted send bypasses this entirely
          // and still has to get past evaluatePosting.
          <p className="rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
            {composerMessage ?? "You can't post here"}
          </p>
        )}
      </div>
    </div>
  )
}
