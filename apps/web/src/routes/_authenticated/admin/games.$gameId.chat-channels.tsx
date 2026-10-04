import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { ArrowDown, ArrowUp, Hash, Lock, Megaphone } from "lucide-react"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type Channel = RouterOutputs["messaging"]["overview"]["channels"][number]
type ChannelType = "TEXT" | "ANNOUNCEMENT"
type StaffRole = "MODERATOR" | "ADMIN" | "OWNER"

// The value carried in the select. "" is the everyone case, because a DOM
// select cannot hold null.
type Visibility = "" | StaffRole

const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "MODERATOR", label: "Staff only (moderators and up)" },
  { value: "ADMIN", label: "Admins and owners" },
  { value: "OWNER", label: "Owners only" },
]

function visibilityLabel(role: StaffRole | null): string {
  return VISIBILITY_OPTIONS.find(option => option.value === (role ?? ""))?.label ?? "Everyone"
}

type ChannelForm = {
  name: string
  description: string
  channelType: ChannelType
  defaultCanPost: boolean
  minimumStaffRole: Visibility
}

const emptyForm = (): ChannelForm => ({
  name: "",
  description: "",
  channelType: "TEXT",
  defaultCanPost: true,
  minimumStaffRole: "",
})

function ChatChannelsPage() {
  const { gameId } = Route.useParams()
  const utils = trpc.useUtils()

  // The same query the player widget runs. Admins get archived channels back
  // too, which is what makes this screen the complete list — and the reorder
  // mutation requires the complete list.
  const overview = trpc.messaging.overview.useQuery({ gameId })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<ChannelForm>(emptyForm())

  const refresh = () => utils.messaging.overview.invalidate({ gameId })

  const create = trpc.messaging.admin.createChannel.useMutation({
    onSuccess: () => {
      void refresh()
      reset()
    },
  })
  const update = trpc.messaging.admin.updateChannel.useMutation({
    onSuccess: () => {
      void refresh()
      reset()
    },
  })
  const setArchived = trpc.messaging.admin.setArchived.useMutation({ onSuccess: () => void refresh() })
  const reorder = trpc.messaging.admin.reorder.useMutation({ onSuccess: () => void refresh() })

  // A failed mutation keeps its error until it is reset, so without this a
  // rejected name goes on being displayed under a table that has since been
  // reordered and archived — an error outliving the thing it described.
  function clearErrors() {
    create.reset()
    update.reset()
    setArchived.reset()
    reorder.reset()
  }

  function reset() {
    clearErrors()
    setEditingId(null)
    setEditing(emptyForm())
  }

  const channels = overview.data?.channels ?? []
  const busy = create.isPending || update.isPending || reorder.isPending || setArchived.isPending
  const error =
    create.error ?? update.error ?? reorder.error ?? setArchived.error ?? overview.error

  function submit() {
    const name = editing.name.trim()
    if (!name) return
    clearErrors()
    const description = editing.description.trim()

    if (editingId) {
      update.mutate({
        gameId,
        channelId: editingId,
        name,
        description: description.length > 0 ? description : null,
        channelType: editing.channelType,
        defaultCanPost: editing.defaultCanPost,
        minimumStaffRole: editing.minimumStaffRole === "" ? null : editing.minimumStaffRole,
      })
    } else {
      create.mutate({
        gameId,
        name,
        description: description.length > 0 ? description : null,
        channelType: editing.channelType,
        defaultCanPost: editing.defaultCanPost,
        minimumStaffRole: editing.minimumStaffRole === "" ? null : editing.minimumStaffRole,
      })
    }
  }

  // Swaps one channel with its neighbour and sends the whole list back.
  // reorderChannels refuses a partial list on purpose: moving one channel
  // shifts every channel below it, so a partial update would leave the rest
  // holding stale positions.
  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= channels.length) return
    const next = channels.map(channel => channel.channelId)
    const moved = next[index]
    const displaced = next[target]
    if (moved === undefined || displaced === undefined) return
    next[index] = displaced
    next[target] = moved
    reorder.mutate({ gameId, channelIds: next })
  }

  if (overview.isLoading) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>
  }

  // messagingProcedure resolves the acting player from the session plus this
  // game, so managing a game's channels currently requires a character in it.
  if (overview.error) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <h1 className="font-serif text-xl font-semibold text-foreground">Chat Channels</h1>
        <p className="mt-3 rounded-lg border border-border bg-card p-3 text-sm text-destructive">
          {overview.error.message}
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-3 p-4">
      <div>
        <h1 className="font-serif text-xl font-semibold text-foreground">Chat Channels</h1>
        <p className="text-xs text-muted-foreground">
          {overview.data?.server?.name ?? "Global"} server · changes reach every player immediately
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-2 shadow-md">
        <div className="grid grid-cols-[300px_1fr] items-start gap-2">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {editingId ? "Edit Channel" : "New Channel"}
              </h2>
            </div>
            <div className="space-y-3 p-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Name
                </label>
                <Input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Testing Feedback"
                  className="h-8 text-sm"
                />
                {/* Stored normalized, so there is no separate display form and
                    two channels cannot differ by casing alone. */}
                <p className="text-[10px] text-muted-foreground">
                  Saved as <span className="font-mono">#{normalizePreview(editing.name) || "…"}</span>
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Description
                </label>
                <Input
                  value={editing.description}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Shown under the channel name"
                  className="h-8 text-sm"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Type
                </label>
                <select
                  value={editing.channelType}
                  onChange={e => setEditing({ ...editing, channelType: e.target.value as ChannelType })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  <option value="TEXT">Text</option>
                  <option value="ANNOUNCEMENT">Announcement</option>
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Cosmetic — only changes the icon. Posting is set below.
                </p>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Who can see it
                </label>
                <select
                  value={editing.minimumStaffRole}
                  onChange={e =>
                    setEditing({ ...editing, minimumStaffRole: e.target.value as Visibility })
                  }
                  className="h-8 rounded-md border border-border bg-background px-2 text-sm text-foreground"
                >
                  {VISIBILITY_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  A restricted channel is hidden from everyone below the rank — it does not appear
                  in their list and cannot be opened directly.
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={editing.defaultCanPost}
                  onChange={e => setEditing({ ...editing, defaultCanPost: e.target.checked })}
                />
                <span>
                  Everyone can post
                  <span className="block text-[10px] text-muted-foreground">
                    Unticked, staff post and everyone else reads.
                  </span>
                </span>
              </label>

              <div className="flex gap-2">
                <Button size="sm" onClick={submit} disabled={busy || !editing.name.trim()}>
                  {editingId ? "Save" : "Add Channel"}
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Channels
              </h2>
              <Button size="sm" variant="ghost" onClick={reset}>
                + New Channel
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Channel
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Visible to
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Posting
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Order
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {channels.map((channel, index) => (
                  <ChannelRow
                    key={channel.channelId}
                    channel={channel}
                    isFirst={index === 0}
                    isLast={index === channels.length - 1}
                    busy={busy}
                    onEdit={() => {
                      clearErrors()
                      setEditingId(channel.channelId)
                      setEditing({
                        name: channel.name,
                        description: channel.description ?? "",
                        channelType: channel.channelType === "ANNOUNCEMENT" ? "ANNOUNCEMENT" : "TEXT",
                        defaultCanPost: channel.defaultCanPost,
                        minimumStaffRole: channel.minimumStaffRole ?? "",
                      })
                    }}
                    onMove={direction => {
                      clearErrors()
                      move(index, direction)
                    }}
                    onArchive={() => {
                      clearErrors()
                      setArchived.mutate({
                        gameId,
                        channelId: channel.channelId,
                        isArchived: !channel.isArchived,
                      })
                    }}
                  />
                ))}
                {channels.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No channels yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {error && <p className="px-3 pb-3 pt-2 text-sm text-destructive">{error.message}</p>}
          </section>
        </div>
      </div>
    </div>
  )
}

function ChannelRow({
  channel,
  isFirst,
  isLast,
  busy,
  onEdit,
  onMove,
  onArchive,
}: {
  channel: Channel
  isFirst: boolean
  isLast: boolean
  busy: boolean
  onEdit: () => void
  onMove: (direction: -1 | 1) => void
  onArchive: () => void
}) {
  const Icon = channel.channelType === "ANNOUNCEMENT" ? Megaphone : Hash
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="font-medium text-foreground">{channel.name}</span>
        </div>
        {channel.description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{channel.description}</p>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {channel.minimumStaffRole ? (
          <span className="flex items-center gap-1 text-foreground">
            <Lock className="h-3 w-3 shrink-0" />
            {visibilityLabel(channel.minimumStaffRole)}
          </span>
        ) : (
          <span className="text-muted-foreground">Everyone</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {channel.defaultCanPost ? (
          <span className="text-foreground">Everyone</span>
        ) : (
          <span className="text-muted-foreground">Staff only</span>
        )}
      </td>
      <td className="px-3 py-2 text-xs">
        {channel.isArchived ? (
          <span className="text-muted-foreground">Archived</span>
        ) : (
          <span className="text-primary">Active</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-0.5">
          <button
            onClick={() => onMove(-1)}
            disabled={isFirst || busy}
            aria-label={`Move ${channel.name} up`}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={isLast || busy}
            aria-label={`Move ${channel.name} down`}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
      <td className="space-x-1 px-3 py-2 text-right">
        <Button size="sm" variant="ghost" onClick={onEdit} disabled={busy}>
          Edit
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          className={channel.isArchived ? "" : "text-destructive hover:text-destructive"}
          onClick={() => {
            // Archiving is reversible and keeps every message, so it asks once
            // rather than warning. There is no delete, deliberately.
            if (!channel.isArchived && !confirm(`Archive #${channel.name}? History is kept.`)) return
            onArchive()
          }}
        >
          {channel.isArchived ? "Restore" : "Archive"}
        </Button>
      </td>
    </tr>
  )
}

// Mirrors normalizeChannelName on the server so the admin sees what will
// actually be stored before saving. The server still normalizes — this is a
// preview, not the rule.
function normalizePreview(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/chat-channels")({
  component: ChatChannelsPage,
})
