import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type TopicForm = {
  topicKey: string
  name: string
  isDefaultEnabled: boolean
}
const emptyForm = (): TopicForm => ({ topicKey: "", name: "", isDefaultEnabled: true })

function NotificationTopicsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const { data: topics } = trpc.admin.notificationTopic.list.useQuery(
    { gameId: gameId! },
    { enabled: !!gameId }
  )

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
    if (!editing || !gameId || !editing.topicKey.trim() || !editing.name.trim()) return
    save.mutate({
      id: editingId ?? undefined,
      gameId,
      topicKey: editing.topicKey.trim(),
      name: editing.name.trim(),
      isDefaultEnabled: editing.isDefaultEnabled,
    })
  }

  if (!gameId) return <p className="p-6 text-sm text-muted-foreground">No game configured yet.</p>

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Notification Topics</h1>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-foreground">Topics</h2>
          <Button size="sm" onClick={() => { setEditing(emptyForm()); setEditingId(null) }}>
            + Add Topic
          </Button>
        </header>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Default</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {topics?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-mono text-xs text-foreground">{t.topicKey}</td>
                <td className="px-4 py-2 text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.isDefaultEnabled ? "On" : "Off"}</td>
                <td className="px-4 py-2 text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => {
                    setEditingId(t.id)
                    setEditing({ topicKey: t.topicKey, name: t.name, isDefaultEnabled: t.isDefaultEnabled })
                  }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                    onClick={() => { if (!confirm("Delete this topic? This will also remove all player notification settings and notifications for this topic.")) return; remove.mutate({ id: t.id }) }}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
            {topics?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No notification topics defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
        {remove.error && <p className="px-4 pb-3 text-sm text-destructive">{remove.error.message}</p>}
      </section>

      {editing !== null && (
        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              {editingId ? "Edit Topic" : "Add Topic"}
            </h2>
          </header>
          <div className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Topic Key</label>
                <Input
                  value={editing.topicKey}
                  onChange={(e) => setEditing({ ...editing, topicKey: e.target.value })}
                  placeholder="e.g. ANIMAL_HEALTH_ALERT"
                  className="mt-1 font-mono text-xs"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Display Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Animal Health Alerts"
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.isDefaultEnabled}
                  onChange={(e) => setEditing({ ...editing, isDefaultEnabled: e.target.checked })}
                  className="rounded border-input"
                />
                <span>Enabled by default for new players</span>
              </label>
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={submit}
                disabled={save.isPending || !editing.topicKey.trim() || !editing.name.trim()}
              >
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

export const Route = createFileRoute("/_authenticated/admin/notification-topics")({
  component: NotificationTopicsPage,
})
