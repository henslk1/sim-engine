import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type CertForm = {
  name: string
  validForCycles: string
  requiredForCompetition: boolean
}

const emptyCert = (): CertForm => ({ name: "", validForCycles: "", requiredForCompetition: false })

function HealthCertificatesPage() {
  const { gameId } = Route.useParams()

  const { data: certs } = trpc.admin.healthCert.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const utils = trpc.useUtils()

  const saveCert = trpc.admin.healthCert.save.useMutation({
    onSuccess: () => {
      utils.admin.healthCert.list.invalidate()
      setEditingId(null)
      setEditing(emptyCert())
    },
  })
  const removeCert = trpc.admin.healthCert.remove.useMutation({
    onSuccess: () => {
      utils.admin.healthCert.list.invalidate()
      setEditingId(null)
      setEditing(emptyCert())
    },
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editing, setEditing] = useState<CertForm>(emptyCert())

  function openEdit(cert: NonNullable<typeof certs>[number]) {
    setEditingId(cert.id)
    setEditing({
      name: cert.name,
      validForCycles: cert.validForCycles.toString(),
      requiredForCompetition: cert.requiredForCompetition,
    })
  }

  function submitCert() {
    if (!gameId || !editing.name.trim() || !editing.validForCycles) return
    saveCert.mutate({
      id: editingId ?? undefined,
      gameId,
      name: editing.name.trim(),
      validForCycles: parseInt(editing.validForCycles),
      requiredForCompetition: editing.requiredForCompetition,
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-xl font-semibold text-foreground mb-4">Health Certificates</h1>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <div className="grid grid-cols-[280px_1fr] gap-2 items-start">
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {editingId ? "Edit Certificate" : "New Certificate"}
            </h2>
          </div>
          <div className="p-3 space-y-2.5">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
              <Input
                className="h-8 text-sm"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Annual Health Certificate"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Valid For (cycles)</label>
              <Input
                className="h-8 text-sm"
                type="number"
                min="1"
                value={editing.validForCycles}
                onChange={(e) => setEditing({ ...editing, validForCycles: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={editing.requiredForCompetition}
                onChange={(e) => setEditing({ ...editing, requiredForCompetition: e.target.checked })}
              />
              Required for Competition
            </label>
            <div className="flex gap-2 pt-1">
              <Button className="h-8 text-sm" onClick={submitCert} disabled={saveCert.isPending || !editing.name.trim() || !editing.validForCycles}>Save</Button>
              {editingId && (
                <Button className="h-8 text-sm" variant="ghost" onClick={() => { setEditingId(null); setEditing(emptyCert()) }}>Cancel</Button>
              )}
            </div>
            {saveCert.error && <p className="text-sm text-destructive">{saveCert.error.message}</p>}
            {editingId && (
              <div className="pt-1 border-t border-border">
                {removeCert.error && <p className="text-sm text-destructive mb-1">{removeCert.error.message}</p>}
                <Button
                  className="h-8 text-sm"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (!confirm("Delete this health certificate definition?")) return
                    removeCert.mutate({ id: editingId })
                  }}
                  disabled={removeCert.isPending}
                >
                  <span className="text-destructive">Delete Certificate</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
          <div className="border-b border-border bg-secondary/40 px-3 py-2">
            <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Certificate Definitions</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Valid For</th>
                <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Req. for Competition</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certs?.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.validForCycles} cycles</td>
                  <td className="px-3 py-2 text-center">
                    {c.requiredForCompetition ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                  </td>
                </tr>
              ))}
              {certs?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">No health certificates defined yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/health-certificates")({
  component: HealthCertificatesPage,
})
