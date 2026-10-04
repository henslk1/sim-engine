import { useState } from "react"
import { Hash, Lock, Megaphone, MessageCircle, Plus, User, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useSocketEvent, type MessagingConnection } from "@/lib/messaging/socket-events"
import { Conversation, type ConversationTarget } from "./conversation"

type Overview = RouterOutputs["messaging"]["overview"]
type ChannelSummary = Overview["channels"][number]
type DirectSummary = Overview["directMessages"][number]

// Below this the pane shows one thing at a time: the rail stays, and opening a
// conversation replaces the list. Above it, list and conversation sit side by
// side the way Discord does. The widget starts at 400px and resizes to 700, so
// both layouts are reachable without leaving the widget.
const THREE_COLUMN_MIN_WIDTH = 560

// Which rail entry is selected. Direct messages are their own destination
// rather than a section inside a server, because they do not belong to one —
// the same conversation exists whatever server you were last looking at.
type Rail = { kind: "dms" } | { kind: "server"; serverId: string }

function channelIcon(channel: ChannelSummary) {
  if (channel.isArchived) return Lock
  return channel.channelType === "ANNOUNCEMENT" ? Megaphone : Hash
}

function channelTarget(channel: ChannelSummary): ConversationTarget {
  return {
    channelId: channel.channelId,
    title: channel.name,
    isDirect: false,
    isAnnouncement: channel.channelType === "ANNOUNCEMENT",
    description: channel.description,
    isArchived: channel.isArchived,
    canPost: channel.canPost,
    cannotPostReason: channel.cannotPostReason,
    profileUsername: null,
  }
}

function directTarget(conversation: DirectSummary): ConversationTarget {
  return {
    channelId: conversation.channelId,
    title: conversation.participant.username,
    isDirect: true,
    isAnnouncement: false,
    // A conversation is named by who is in it, so there is nothing to subtitle.
    description: null,
    isArchived: false,
    canPost: conversation.canPost,
    cannotPostReason: conversation.cannotPostReason,
    profileUsername: conversation.participant.username,
  }
}

export function ChatSection({
  gameId,
  connection,
  width,
}: {
  gameId: string
  connection: MessagingConnection
  width: number
}) {
  const utils = trpc.useUtils()
  // Null until the player picks, so the first render can fall back to whatever
  // the game actually has rather than guessing before the data arrives.
  const [rail, setRail] = useState<Rail | null>(null)
  const [openChannelId, setOpenChannelId] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const { data: overview, isLoading } = trpc.messaging.overview.useQuery({ gameId })

  const refresh = () => void utils.messaging.overview.invalidate()
  useSocketEvent("channel:created", refresh)
  useSocketEvent("channel:updated", refresh)
  useSocketEvent("channel:archived", refresh)

  // A message in a conversation that is not open changes an unread count. One
  // that is open does not: the conversation marks it read, and that invalidates
  // the overview on its own. Refetching here too would make the badge flash.
  useSocketEvent<{ channelId: string }>("message:created", payload => {
    if (payload.channelId !== openChannelId) refresh()
  })

  const channels = overview?.channels ?? []
  const conversations = overview?.directMessages ?? []
  const server = overview?.server ?? null

  // Channels are the shared space and where a new player has something to read,
  // so that is the opening view. Someone with no server at all lands on DMs.
  const activeRail: Rail = rail ?? (server ? { kind: "server", serverId: server.id } : { kind: "dms" })

  const openChannel = channels.find(channel => channel.channelId === openChannelId)
  const openConversation = conversations.find(dm => dm.channelId === openChannelId)
  const openTarget = openChannel
    ? channelTarget(openChannel)
    : openConversation
      ? directTarget(openConversation)
      : null

  const channelUnread = channels.reduce((sum, channel) => sum + channel.unreadCount, 0)
  const directUnread = conversations.reduce((sum, dm) => sum + dm.unreadCount, 0)

  const wide = width >= THREE_COLUMN_MIN_WIDTH
  // Narrow: the conversation takes the list's place. Wide: both are on screen,
  // so the list never has to be dismissed to read something.
  const showList = wide || openTarget === null

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>
  }

  function selectRail(next: Rail) {
    setRail(next)
    setComposing(false)
    // Leaving a destination closes what was open inside it. Keeping it would
    // show a channel while the list beside it belongs to somewhere else.
    setOpenChannelId(null)
  }

  return (
    <div className="flex h-full min-h-0">
      <nav className="flex w-12 shrink-0 flex-col items-center gap-1 border-r border-border bg-muted/30 py-2">
        <RailButton
          label="Direct messages"
          active={activeRail.kind === "dms"}
          unread={directUnread}
          onClick={() => selectRail({ kind: "dms" })}
        >
          <MessageCircle className="h-4 w-4" />
        </RailButton>

        {server && (
          <>
            <div className="my-1 h-px w-6 bg-border" />
            <RailButton
              label={server.name}
              active={activeRail.kind === "server"}
              unread={channelUnread}
              onClick={() => selectRail({ kind: "server", serverId: server.id })}
            >
              {/* No server artwork exists, so the initial stands in — the same
                  thing Discord falls back to for a server without an icon. */}
              <span className="text-[11px] font-bold">{server.name.slice(0, 1).toUpperCase()}</span>
            </RailButton>
          </>
        )}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {connection.status !== "online" && (
          <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground">
            {connection.status === "connecting" ? "Connecting…" : "Reconnecting…"}
          </p>
        )}

        <div className="flex min-h-0 flex-1">
          {showList && (
            <div
              className={[
                "min-h-0 overflow-y-auto p-2",
                wide && openTarget ? "w-40 shrink-0 border-r border-border" : "flex-1",
              ].join(" ")}
            >
              {composing ? null : activeRail.kind === "dms" ? (
                <DirectList
                  conversations={conversations}
                  openChannelId={openChannelId}
                  onOpen={setOpenChannelId}
                  onCompose={() => setComposing(true)}
                />
              ) : (
                <ChannelList
                  serverName={server?.name ?? "Channels"}
                  channels={channels}
                  openChannelId={openChannelId}
                  onOpen={setOpenChannelId}
                />
              )}
            </div>
          )}

          <div className="min-h-0 min-w-0 flex-1">
            {composing ? (
              <NewConversation
                gameId={gameId}
                onCancel={() => setComposing(false)}
                onOpened={channelId => {
                  setComposing(false)
                  setRail({ kind: "dms" })
                  setOpenChannelId(channelId)
                  refresh()
                }}
              />
            ) : openTarget && overview ? (
              <Conversation
                gameId={gameId}
                target={openTarget}
                connection={connection}
                viewer={overview.viewer}
                // Only reachable in the narrow layout; with the list already on
                // screen there is nothing to go back to.
                onBack={wide ? null : () => setOpenChannelId(null)}
              />
            ) : wide ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <MessageCircle className="h-8 w-8 opacity-30" />
                <p className="text-xs">
                  {activeRail.kind === "dms" ? "Pick a conversation." : "Pick a channel."}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
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
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
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

function ChannelList({
  serverName,
  channels,
  openChannelId,
  onOpen,
}: {
  serverName: string
  channels: ChannelSummary[]
  openChannelId: string | null
  onOpen: (channelId: string) => void
}) {
  if (channels.length === 0) {
    return <p className="px-1 text-[10px] text-muted-foreground">No channels yet.</p>
  }
  return (
    <>
      <SectionHeading label={serverName} />
      {channels.map(channel => {
        const Icon = channelIcon(channel)
        return (
          <SidebarRow
            key={channel.channelId}
            active={channel.channelId === openChannelId}
            icon={<Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            label={channel.name}
            unread={channel.unreadCount}
            trailing={
              channel.isArchived ? (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                  archived
                </span>
              ) : null
            }
            onClick={() => onOpen(channel.channelId)}
          />
        )
      })}
    </>
  )
}

function DirectList({
  conversations,
  openChannelId,
  onOpen,
  onCompose,
}: {
  conversations: DirectSummary[]
  openChannelId: string | null
  onOpen: (channelId: string) => void
  onCompose: () => void
}) {
  return (
    <>
      <div className="flex items-center justify-between pr-1">
        <SectionHeading label="Direct messages" />
        <button
          onClick={onCompose}
          aria-label="New message"
          className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      {conversations.length === 0 ? (
        <p className="px-1 text-[10px] text-muted-foreground">No conversations yet.</p>
      ) : (
        conversations.map(conversation => (
          <SidebarRow
            key={conversation.channelId}
            active={conversation.channelId === openChannelId}
            icon={
              <Avatar
                username={conversation.participant.username}
                avatar={conversation.participant.avatar}
              />
            }
            label={conversation.participant.username}
            unread={conversation.unreadCount}
            trailing={null}
            onClick={() => onOpen(conversation.channelId)}
          />
        ))
      )}
    </>
  )
}

// The player's own profile picture, which is the one image messaging uses.
// Falls back to an initial rather than a placeholder graphic.
function Avatar({ username, avatar }: { username: string; avatar: string | null }) {
  if (avatar) {
    return <img src={avatar} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" />
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground">
      {username.slice(0, 1).toUpperCase()}
    </span>
  )
}

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="truncate px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
  )
}

function SidebarRow({
  icon,
  label,
  unread,
  trailing,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  unread: number
  trailing: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        active ? "bg-muted" : "hover:bg-muted",
      ].join(" ")}
    >
      {icon}
      <span
        className={[
          "min-w-0 flex-1 truncate text-xs",
          unread > 0 || active ? "font-semibold text-foreground" : "text-muted-foreground",
        ].join(" ")}
      >
        {label}
      </span>
      {trailing}
      {unread > 0 && (
        <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  )
}

// Picking somebody to start a conversation with.
//
// Opening is idempotent — the server returns the existing conversation if there
// is one — so choosing somebody you already talk to simply reopens that thread
// rather than failing or duplicating it.
function NewConversation({
  gameId,
  onCancel,
  onOpened,
}: {
  gameId: string
  onCancel: () => void
  onOpened: (channelId: string) => void
}) {
  const [query, setQuery] = useState("")

  const results = trpc.messaging.findPlayers.useQuery(
    { gameId, query },
    // A single character matches most of the roster, which is a lot of rows to
    // fetch on every keystroke for a list nobody can use yet.
    { enabled: query.trim().length >= 2 }
  )
  const open = trpc.messaging.openDirectMessage.useMutation({
    onSuccess: conversation => onOpened(conversation.channelId),
  })

  const players = results.data ?? []
  const searching = query.trim().length >= 2

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-1.5">
        <span className="flex-1 text-xs font-semibold text-foreground">New message</span>
        <button
          onClick={onCancel}
          aria-label="Cancel new message"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="shrink-0 p-2">
        <input
          value={query}
          autoFocus
          onChange={event => setQuery(event.target.value)}
          placeholder="Search by username"
          className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {!searching ? (
          <p className="px-1 text-[10px] text-muted-foreground">Type at least two characters.</p>
        ) : results.isLoading ? (
          <p className="px-1 text-[10px] text-muted-foreground">Searching…</p>
        ) : players.length === 0 ? (
          <p className="px-1 text-[10px] text-muted-foreground">Nobody by that name.</p>
        ) : (
          players.map(player => (
            <button
              key={player.playerAccountId}
              disabled={open.isPending}
              onClick={() => open.mutate({ gameId, targetPlayerAccountId: player.playerAccountId })}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <Avatar username={player.username} avatar={player.avatar} />
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">
                {player.username}
              </span>
            </button>
          ))
        )}
        {open.error && <p className="px-1 pt-2 text-[10px] text-destructive">{open.error.message}</p>}
      </div>
    </div>
  )
}
