import { useState } from "react"
import { Hash, Lock, Megaphone, MessageCircle, Plus, X } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useSocketEvent, type MessagingConnection } from "@/lib/messaging/socket-events"
import { Conversation, type ConversationTarget } from "./conversation"

type Overview = RouterOutputs["messaging"]["overview"]
type ChannelSummary = Overview["channels"][number]
type DirectSummary = Overview["directMessages"][number]

// Below this the pane shows one thing at a time: opening a conversation
// replaces the list. Above it, list and conversation sit side by side the way
// Discord does. The widget starts at 400px and resizes to 700, so both layouts
// are reachable without leaving the widget.
//
// 512 rather than 560 because the destination rail moved out to the widget,
// where it is shared with notifications and the tutorial. Those 48px went to
// the conversation, so this pane is as wide at 512 now as it was at 560 before.
const TWO_COLUMN_MIN_WIDTH = 512

// Which rail entry the widget has selected. Direct messages are their own
// destination rather than a section inside a server, because they do not belong
// to one — the same conversation exists whatever server you were last looking
// at.
export type ChatDestination = { kind: "dms" } | { kind: "server"; serverId: string }

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
  destination,
}: {
  gameId: string
  connection: MessagingConnection
  width: number
  destination: ChatDestination
}) {
  const utils = trpc.useUtils()
  // One per destination rather than one shared id. Switching to the server and
  // back lands on the conversation that was open, which is how Discord behaves
  // — and it rules out the bug a single id invites, where a channel is still
  // open beside a list of direct messages.
  const [openChannelId, setOpenChannelId] = useState<string | null>(null)
  const [openDirectId, setOpenDirectId] = useState<string | null>(null)
  const [composeRequested, setComposeRequested] = useState(false)

  const { data: overview, isLoading } = trpc.messaging.overview.useQuery({ gameId })

  const refresh = () => void utils.messaging.overview.invalidate()
  useSocketEvent("channel:created", refresh)
  useSocketEvent("channel:updated", refresh)
  useSocketEvent("channel:archived", refresh)

  const onDms = destination.kind === "dms"
  const openId = onDms ? openDirectId : openChannelId
  const setOpenId = onDms ? setOpenDirectId : setOpenChannelId
  // Starting a conversation is a direct-message act, so it only shows there.
  // Switching to the server hides it without discarding it, the same way the
  // open conversation is kept — come back and the half-typed search is still
  // there.
  const composing = composeRequested && onDms

  // A message in a conversation that is not open changes an unread count. One
  // that is open does not: the conversation marks it read, and that invalidates
  // the overview on its own. Refetching here too would make the badge flash.
  useSocketEvent<{ channelId: string }>("message:created", payload => {
    if (payload.channelId !== openId) refresh()
  })

  const channels = overview?.channels ?? []
  const conversations = overview?.directMessages ?? []

  // Looked up in the list this destination owns, so an id left over from the
  // other one cannot resolve to a target here.
  const openChannel = onDms ? undefined : channels.find(channel => channel.channelId === openId)
  const openConversation = onDms ? conversations.find(dm => dm.channelId === openId) : undefined
  const openTarget = openChannel
    ? channelTarget(openChannel)
    : openConversation
      ? directTarget(openConversation)
      : null

  const wide = width >= TWO_COLUMN_MIN_WIDTH
  // Narrow: the conversation takes the list's place. Wide: both are on screen,
  // so the list never has to be dismissed to read something. Composing takes
  // the whole pane either way — picking somebody is the only thing to do.
  const showList = !composing && (wide || openTarget === null)

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
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
            {onDms ? (
              <DirectList
                conversations={conversations}
                openChannelId={openId}
                onOpen={setOpenDirectId}
                onCompose={() => setComposeRequested(true)}
              />
            ) : (
              <ChannelList
                channels={channels}
                openChannelId={openId}
                onOpen={setOpenChannelId}
              />
            )}
          </div>
        )}

        <div className="min-h-0 min-w-0 flex-1">
          {composing ? (
            <NewConversation
              gameId={gameId}
              onCancel={() => setComposeRequested(false)}
              onOpened={channelId => {
                setComposeRequested(false)
                setOpenDirectId(channelId)
                refresh()
              }}
            />
          ) : openTarget && overview ? (
            <Conversation
              // Keyed so a different channel gets a fresh component rather than
              // the same one told to change. Conversation clears its messages in
              // an effect, which runs after the paint — so without this it draws
              // one frame of the previous channel's history under the new name.
              // Harmless between two channels; alarming when the new name is a
              // person.
              key={openTarget.channelId}
              gameId={gameId}
              target={openTarget}
              connection={connection}
              viewer={overview.viewer}
              // Only reachable in the narrow layout; with the list already on
              // screen there is nothing to go back to.
              onBack={wide ? null : () => setOpenId(null)}
            />
          ) : wide ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-30" />
              <p className="text-xs">{onDms ? "Pick a conversation." : "Pick a channel."}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// No heading above the list: the widget's own header already names the server,
// and there are no categories to divide the channels into. Discord puts the
// server name in that header too, and uses the headings for its categories.
function ChannelList({
  channels,
  openChannelId,
  onOpen,
}: {
  channels: ChannelSummary[]
  openChannelId: string | null
  onOpen: (channelId: string) => void
}) {
  if (channels.length === 0) {
    return <p className="px-1 text-[10px] text-muted-foreground">No channels yet.</p>
  }
  return (
    <>
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
      {/* A row rather than a heading with a "+" on the end: the widget header
          already says "Direct messages", so the only thing this strip has to
          carry is the action. */}
      <button
        onClick={onCompose}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">New message</span>
      </button>
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
