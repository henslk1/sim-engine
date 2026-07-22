import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TopicForm = {
  name: string
  description: string
  isDefaultOn: boolean
}
const emptyForm = (): TopicForm => ({ name: "", description: "", isDefaultOn: true })

function NotificationTopicsPage() {
  const { gameId } = Route.useParams()

  const { data: topics } = trpc.admin.notificationTopic.list.useQuery({ gameId: gameId! })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<TopicForm>(emptyForm())
  const utils = trpc.useUtils()

  const save = trpc.admin.notificationTopic.save.useMutation({
    onSuccess: () => {
      utils.admin.notificationTopic.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(emptyForm())
    },
  })
  const remove = trpc.admin.notificationTopic.remove.useMutation({
    onSuccess: () => {
      utils.admin.notificationTopic.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!gameId || !editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      isDefaultOn: editing.isDefaultOn,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground">Notification Topics</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{editingId ? "Edit Topic" : "New Topic"}</h2>
          </div>
          <div className="p-3 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. breeding_update"
                className="h-8 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
              <Input
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Shown to players"
                className="h-8 text-sm"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefaultOn}
                onChange={(e) => setEditing({ ...editing, isDefaultOn: e.target.checked })}
              />
              Default On
            </label>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={save.isPending || !editing.name.trim()}>
                {editingId ? "Save" : "Add Topic"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyForm()) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Topics</h2>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
              + New Topic
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Default On</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {topics?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {t.isDefaultOn ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => {
                      setEditingId(t.id)
                      setEditing({ name: t.name, description: t.description ?? "", isDefaultOn: t.isDefaultOn })
                    }}>Edit</Button>
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (!confirm("Delete this topic?")) return; remove.mutate({ id: t.id }) }}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {topics?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No notification topics yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {remove.error && <p className="px-3 pb-3 text-sm text-destructive">{remove.error.message}</p>}
        </section>
      </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/notification-topics")({
  component: NotificationTopicsPage,
})
