import { useState } from "react"
import { Hash, Lock, Megaphone, MessageCircle, Plus, User, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useSocketEvent, type MessagingConnection } from "@/lib/messaging/socket-events"
import { Conversation, type ConversationTarget } from "./conversation"

type Overview = RouterOutputs["messaging"]["overview"]
type ChannelSummary = Overview["channels"][number]
type DirectSummary = Overview["directMessages"][number]

function channelIcon(channel: ChannelSummary) {
  if (channel.isArchived) return Lock
  return channel.channelType === "ANNOUNCEMENT" ? Megaphone : Hash
}

// Both kinds collapse into the shape the pane wants. Doing it here keeps the
// difference between a channel and a conversation in the sidebar, which is the
// only place it shows.
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
  }
}

// The Messages section of the widget: a channel list, a conversation list, or
// one open conversation.
//
// Master/detail rather than a side-by-side split because the widget is 400px
// wide by default. Discord's two-column layout needs room this does not have.
export function ChatSection({
  gameId,
  connection,
}: {
  gameId: string
  connection: MessagingConnection
}) {
  const utils = trpc.useUtils()
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

  const openChannel = channels.find(channel => channel.channelId === openChannelId)
  const openConversation = conversations.find(dm => dm.channelId === openChannelId)
  const openTarget = openChannel
    ? channelTarget(openChannel)
    : openConversation
      ? directTarget(openConversation)
      : null

  // A conversation that vanished underneath an open pane — a channel archived,
  // or the list reloaded without it. Falling back to the list beats rendering a
  // pane with nothing behind it.
  if (openTarget && overview) {
    return (
      <Conversation
        gameId={gameId}
        target={openTarget}
        connection={connection}
        viewer={overview.viewer}
        onBack={() => setOpenChannelId(null)}
      />
    )
  }

  if (composing) {
    return (
      <NewConversation
        gameId={gameId}
        onCancel={() => setComposing(false)}
        onOpened={channelId => {
          setComposing(false)
          setOpenChannelId(channelId)
          refresh()
        }}
      />
    )
  }

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>
  }

  if (channels.length === 0 && conversations.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <MessageCircle className="h-8 w-8 opacity-30" />
        <p className="text-xs">No channels yet.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {connection.status !== "online" && (
        <p className="shrink-0 border-b border-border bg-muted/40 px-3 py-1 text-[10px] text-muted-foreground">
          {connection.status === "connecting" ? "Connecting…" : "Reconnecting…"}
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {channels.length > 0 && (
          <>
            <SectionHeading label={overview?.server?.name ?? "Channels"} />
            {channels.map(channel => {
              const Icon = channelIcon(channel)
              return (
                <SidebarRow
                  key={channel.channelId}
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
                  onClick={() => setOpenChannelId(channel.channelId)}
                />
              )
            })}
          </>
        )}

        <div className="mt-2 flex items-center justify-between pr-1">
          <SectionHeading label="Direct messages" />
          <button
            onClick={() => setComposing(true)}
            aria-label="New message"
            className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {conversations.length === 0 ? (
          <p className="px-2 py-1 text-[10px] text-muted-foreground">No conversations yet.</p>
        ) : (
          conversations.map(conversation => (
            <SidebarRow
              key={conversation.channelId}
              icon={<User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              label={conversation.participant.username}
              unread={conversation.unreadCount}
              trailing={null}
              onClick={() => setOpenChannelId(conversation.channelId)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </p>
  )
}

function SidebarRow({
  icon,
  label,
  unread,
  trailing,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  unread: number
  trailing: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
    >
      {icon}
      <span
        className={[
          "min-w-0 flex-1 truncate text-xs",
          unread > 0 ? "font-semibold text-foreground" : "text-muted-foreground",
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
              onClick={() =>
                open.mutate({ gameId, targetPlayerAccountId: player.playerAccountId })
              }
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50"
            >
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
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
