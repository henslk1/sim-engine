import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/_authenticated/admin/support/$ticketId")({
  component: TicketDetail,
})

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-chart-1/10 text-chart-1 border-chart-1/30",
  IN_PROGRESS: "bg-primary/10 text-primary border-primary/30",
  RESOLVED: "bg-chart-2/10 text-chart-2 border-chart-2/30",
  CLOSED: "bg-muted text-muted-foreground border-border",
}

function TicketDetail() {
  const { ticketId } = Route.useParams()
  const { data, refetch } = trpc.admin.ops.support.getById.useQuery({ ticketId })
  const replyMutation = trpc.admin.ops.support.reply.useMutation({ onSuccess: () => { refetch(); setBody("") } })
  const setStatusMutation = trpc.admin.ops.support.setStatus.useMutation({ onSuccess: () => refetch() })
  const [body, setBody] = useState("")

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto space-y-4 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/admin/support" className="text-xs text-muted-foreground hover:text-foreground">← All tickets</Link>
          <h1 className="mt-1 font-serif text-xl font-semibold text-foreground">{data.subject}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <Link to="/admin/ops/players/$playerId" params={{ playerId: data.playerAccount.id }} className="hover:text-primary">
              {data.playerAccount.username}
            </Link>
            <span>{new Date(data.createdAt).toLocaleString()}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_COLORS[data.status])}>
            {data.status.replace("_", " ")}
          </span>
          <select
            value={data.status}
            onChange={e => setStatusMutation.mutate({ ticketId, status: e.target.value as never, staffUserId: "CURRENT_USER" })}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm text-foreground whitespace-pre-wrap">{data.body}</p>
      </div>

      <div className="space-y-3">
        {data.messages.map(msg => (
          <div key={msg.id} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{msg.author.name ?? msg.author.email}</span>
              <span>•</span>
              <span>{new Date(msg.createdAt).toLocaleString()}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Reply…"
          rows={4}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
        />
        <button
          onClick={() => replyMutation.mutate({ ticketId, authorId: "CURRENT_USER", body })}
          disabled={!body.trim() || replyMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Send Reply
        </button>
      </div>
    </div>
  )
}
