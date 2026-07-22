import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type CertForm = {
  id?: string
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
    onSuccess: () => utils.admin.healthCert.list.invalidate(),
  })
  const removeCert = trpc.admin.healthCert.remove.useMutation({
    onSuccess: () => {
      utils.admin.healthCert.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<CertForm | null>(null)
  const [formExpanded, setFormExpanded] = useState(false)

  function openEdit(cert: NonNullable<typeof certs>[number]) {
    setEditing({
      id: cert.id,
      name: cert.name,
      validForCycles: cert.validForCycles.toString(),
      requiredForCompetition: cert.requiredForCompetition,
    })
    setFormExpanded(true)
  }

  function submitCert() {
    if (!editing || !gameId || !editing.name.trim() || !editing.validForCycles) return
    saveCert.mutate(
      {
        id: editing.id,
        gameId,
        name: editing.name.trim(),
        validForCycles: parseInt(editing.validForCycles),
        requiredForCompetition: editing.requiredForCompetition,
      },
      {
        onSuccess: (saved) => {
          setEditing((prev) => (prev ? { ...prev, id: saved.id } : null))
          setFormExpanded(false)
        },
      }
    )
  }

  if (editing !== null) {
    return (
      <div className="p-6 max-w-2xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to list
          </button>
          <h1 className="font-serif text-2xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Health Certificate"}
          </h1>
        </div>

        <section className="rounded-lg border border-border bg-card shadow-sm">
          <header className="flex items-center justify-between border-b border-border bg-secondary/40 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Certificate Details</h2>
            {!formExpanded && editing.id && (
              <Button size="sm" variant="ghost" onClick={() => setFormExpanded(true)}>Edit Details</Button>
            )}
          </header>
          {formExpanded || !editing.id ? (
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Name</label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="e.g. Annual Health Certificate"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Valid For (cycles)</label>
                <Input
                  type="number"
                  min="1"
                  value={editing.validForCycles}
                  onChange={(e) => setEditing({ ...editing, validForCycles: e.target.value })}
                  className="mt-1 max-w-xs"
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
                <Button
                  onClick={submitCert}
                  disabled={saveCert.isPending || !editing.name.trim() || !editing.validForCycles}
                >
                  Save
                </Button>
                {editing.id && <Button variant="ghost" onClick={() => setFormExpanded(false)}>Cancel</Button>}
              </div>
              {saveCert.error && <p className="text-sm text-destructive">{saveCert.error.message}</p>}
            </div>
          ) : (
            <div className="p-4 text-sm space-y-1 text-foreground">
              <p><span className="text-muted-foreground">Name:</span> {editing.name}</p>
              <p><span className="text-muted-foreground">Valid For:</span> {editing.validForCycles} cycles</p>
              <p>
                <span className="text-muted-foreground">Required for Competition:</span>{" "}
                {editing.requiredForCompetition ? "Yes" : "No"}
              </p>
            </div>
          )}
        </section>

        {editing.id && (
          <div className="flex items-center justify-end gap-3">
            {removeCert.error && <p className="text-sm text-destructive">{removeCert.error.message}</p>}
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                if (!confirm("Delete this health certificate definition?")) return
                removeCert.mutate({ id: editing.id! })
              }}
              disabled={removeCert.isPending}
            >
              Delete Certificate
            </Button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Health Certificates</h1>
        <Button onClick={() => { setEditing(emptyCert()); setFormExpanded(true) }}>+ New Certificate</Button>
      </div>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Valid For</th>
              <th className="px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Required for Competition</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {certs?.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-4 py-2 font-medium text-foreground">{c.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{c.validForCycles} cycles</td>
                <td className="px-4 py-2 text-center">
                  {c.requiredForCompetition ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                </td>
              </tr>
            ))}
            {certs?.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No health certificates defined yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/health-certificates")({
  component: HealthCertificatesPage,
})
