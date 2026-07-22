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
  const [editing, setEditing] = useState<TopicForm | null>(null)
  const utils = trpc.useUtils()

  const save = trpc.admin.notificationTopic.save.useMutation({
    onSuccess: () => {
      utils.admin.notificationTopic.list.invalidate({ gameId: gameId! })
      setEditingId(null)
      setEditing(null)
    },
  })
  const remove = trpc.admin.notificationTopic.remove.useMutation({
    onSuccess: () => {
      utils.admin.notificationTopic.list.invalidate({ gameId: gameId! })
    },
  })

  function submit() {
    if (!editing || !gameId || !editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      description: editing.description.trim() || null,
      isDefaultOn: editing.isDefaultOn,
    })
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Notification Topics</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Topics</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + New Topic
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default On</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.description ?? "—"}</td>
                <td className="px-4 py-2 text-center">
                  {t.isDefaultOn ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right space-x-1">
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
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No notification topics yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">{editingId ? "Edit Topic" : "New Topic"}</h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. breeding_update"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Description <span className="font-normal">— optional</span></label>
                <Input
                  value={editing.description}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  placeholder="Shown to players"
                  className="mt-1"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editing.isDefaultOn}
                onChange={(e) => setEditing({ ...editing, isDefaultOn: e.target.checked })}
              />
              Default On
            </label>
            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={save.isPending || !editing.name.trim()}>
                {editingId ? "Save" : "Add Topic"}
              </Button>
              <Button variant="ghost" onClick={() => { setEditingId(null); setEditing(null) }}>
                Cancel
              </Button>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </div>
        </section>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/notification-topics")({
  component: NotificationTopicsPage,
})
