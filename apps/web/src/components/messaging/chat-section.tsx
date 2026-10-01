import { useState } from "react"
import { Hash, Lock, Megaphone, MessageCircle } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useSocketEvent, type MessagingConnection } from "@/lib/messaging/socket-events"
import { Conversation } from "./conversation"

type ChannelSummary = RouterOutputs["messaging"]["overview"]["channels"][number]

function channelIcon(channel: ChannelSummary) {
  if (channel.isArchived) return Lock
  return channel.channelType === "ANNOUNCEMENT" ? Megaphone : Hash
}

// The Messages section of the widget: a channel list, or one open conversation.
//
// Master/detail rather than a side-by-side split because the widget is 400px
// wide by default. Discord's two-column layout needs room this does not have.
export function ChatSection({
  gameId,
  connection,
  playerAccountId,
}: {
  gameId: string
  connection: MessagingConnection
  playerAccountId: string | undefined
}) {
  const utils = trpc.useUtils()
  const [openChannelId, setOpenChannelId] = useState<string | null>(null)

  const { data: overview, isLoading } = trpc.messaging.overview.useQuery({ gameId })

  // Channel structure changed for everybody in the game. The broadcast carries
  // the parts that are the same for everyone, but canPost is per player — so
  // the list is refetched rather than patched from the event.
  const refresh = () => void utils.messaging.overview.invalidate()
  useSocketEvent("channel:created", refresh)
  useSocketEvent("channel:updated", refresh)
  useSocketEvent("channel:archived", refresh)

  // A message in a channel that is not open changes an unread count. One that
  // is open does not: the conversation marks it read, and that invalidates the
  // overview on its own. Refetching here too would make the badge flash.
  useSocketEvent<{ channelId: string }>("message:created", payload => {
    if (payload.channelId !== openChannelId) refresh()
  })

  const channels = overview?.channels ?? []
  const openChannel = channels.find(channel => channel.channelId === openChannelId)

  // A channel that disappeared underneath an open conversation — archived, or
  // the list reloaded without it. Falling back to the list beats rendering a
  // pane with nothing behind it.
  if (openChannelId !== null && openChannel) {
    return (
      <Conversation
        gameId={gameId}
        channel={openChannel}
        connection={connection}
        playerAccountId={playerAccountId}
        onBack={() => setOpenChannelId(null)}
      />
    )
  }

  if (isLoading) {
    return <p className="p-3 text-xs text-muted-foreground">Loading…</p>
  }

  if (channels.length === 0) {
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
        <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
          {overview?.server?.name ?? "Channels"}
        </p>
        {channels.map(channel => {
          const Icon = channelIcon(channel)
          const unread = channel.unreadCount > 0
          return (
            <button
              key={channel.channelId}
              onClick={() => setOpenChannelId(channel.channelId)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span
                className={[
                  "min-w-0 flex-1 truncate text-xs",
                  unread ? "font-semibold text-foreground" : "text-muted-foreground",
                ].join(" ")}
              >
                {channel.name}
              </span>
              {channel.isArchived && (
                <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground">
                  archived
                </span>
              )}
              {unread && (
                <span className="flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                  {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
