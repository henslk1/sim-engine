import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/events")({
  component: OpsEvents,
})

function OpsEvents() {
  const { gameId } = Route.useParams()

  const { data: events, refetch } = trpc.admin.ops.events.list.useQuery(
    { gameId: gameId! },
    {},
  )

  const createMutation = trpc.admin.ops.events.create.useMutation({ onSuccess: () => { refetch(); setShowForm(false); resetForm() } })
  const updateMutation = trpc.admin.ops.events.update.useMutation({ onSuccess: () => { refetch() } })
  const deleteMutation = trpc.admin.ops.events.delete.useMutation({ onSuccess: () => refetch() })

  const [showForm, setShowForm] = useState(false)

  const [eventType, setEventType] = useState("breeding_bonus")
  const [configJson, setConfigJson] = useState("{}")
  const [startsAt, setStartsAt] = useState("")
  const [endsAt, setEndsAt] = useState("")
  const [isTemplate, setIsTemplate] = useState(false)
  const [jsonError, setJsonError] = useState("")

  function resetForm() {
    setEventType("breeding_bonus"); setConfigJson("{}"); setStartsAt(""); setEndsAt(""); setIsTemplate(false); setJsonError("")
  }

  function handleCreate() {
    let parsed: Record<string, unknown>
    try { parsed = JSON.parse(configJson) } catch { setJsonError("Invalid JSON"); return }
    setJsonError("")
    createMutation.mutate({ gameId: gameId!, eventType, configOverrides: parsed, startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(), isTemplate, staffUserId: "CURRENT_USER" })
  }

  const now = new Date()

  return (
    <div className="space-y-3 p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Event Scheduler</h1>
        <Button size="sm" onClick={() => setShowForm(v => !v)}>
          + New Event
        </Button>
      </div>

      {showForm && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Create Live Ops Event</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Event Type</label>
                <Input
                  value={eventType}
                  onChange={e => setEventType(e.target.value)}
                  placeholder="e.g. breeding_bonus"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" checked={isTemplate} onChange={e => setIsTemplate(e.target.checked)} className="rounded" />
                  Save as template
                </label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Starts At</label>
                <Input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} className="h-8 text-sm" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Ends At</label>
                <Input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Config Overrides (JSON)</label>
              <textarea
                value={configJson}
                onChange={e => setConfigJson(e.target.value)}
                rows={4}
                className={cn("w-full rounded-md border bg-background px-3 py-2 font-mono text-xs outline-none focus:border-primary resize-none", jsonError ? "border-destructive" : "border-border")}
              />
              {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!eventType || !startsAt || !endsAt || createMutation.isPending}
              >
                Create
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); resetForm() }}>
                Cancel
              </Button>
            </div>
          </div>
        </section>
      )}

      <div className="space-y-2">
        {events?.map(ev => {
          const isActive = ev.isActive && new Date(ev.startsAt) <= now && new Date(ev.endsAt) >= now
          const isUpcoming = new Date(ev.startsAt) > now
          const isPast = new Date(ev.endsAt) < now
          return (
            <div key={ev.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{ev.eventType}</span>
                    {ev.isTemplate && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">TEMPLATE</span>}
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isActive ? "bg-chart-2/10 text-chart-2" :
                      isUpcoming ? "bg-primary/10 text-primary" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {isActive ? "LIVE" : isUpcoming ? "UPCOMING" : "ENDED"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(ev.startsAt).toLocaleString()} → {new Date(ev.endsAt).toLocaleString()}
                  </p>
                  <pre className="mt-1 rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    {JSON.stringify(ev.configOverrides, null, 2)}
                  </pre>
                </div>
                <div className="flex shrink-0 gap-2">
                  {!isPast && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => updateMutation.mutate({ eventId: ev.id, isActive: !ev.isActive, staffUserId: "CURRENT_USER" })}
                    >
                      {ev.isActive ? "Deactivate" : "Activate"}
                    </Button>
                  )}
                  <button
                    onClick={() => { if (confirm("Delete this event?")) deleteMutation.mutate({ eventId: ev.id, staffUserId: "CURRENT_USER" }) }}
                    className="rounded-md border border-border p-1 text-muted-foreground hover:border-destructive/30 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
        {!events?.length && (
          <p className="rounded-lg border border-border py-6 text-center text-sm text-muted-foreground">No events scheduled.</p>
        )}
      </div>
    </div>
  )
}
