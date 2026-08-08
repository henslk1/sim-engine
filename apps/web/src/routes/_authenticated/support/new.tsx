import { createFileRoute, useNavigate, Link } from "@tanstack/react-router"
import React, { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Loader2 } from "lucide-react"

export const Route = createFileRoute("/_authenticated/support/new")({
  component: NewTicketPage,
})

const CATEGORIES = [
  { value: "GENERAL", label: "General" },
  { value: "EXPLOIT", label: "Exploit Report" },
  { value: "BILLING", label: "Billing" },
  { value: "ACCOUNT", label: "Account" },
  { value: "APPEAL", label: "Appeal" },
  { value: "DISPUTE", label: "Dispute" },
] as const

function NewTicketPage() {
  const navigate = useNavigate()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const [subject, setSubject] = useState("")
  const [category, setCategory] = useState<string>("GENERAL")
  const [body, setBody] = useState("")

  const { mutate, isPending, error } = trpc.supportTicket.create.useMutation({
    onSuccess: (ticket) => navigate({ to: "/support/$ticketId", params: { ticketId: ticket.id } }),
  })

  function handleSubmit() {
    if (!gameId) return
    mutate({
      gameId,
      subject,
      category: category as typeof CATEGORIES[number]["value"],
      body,
    })
  }

  const inputClass = "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl font-semibold text-foreground mb-1">Contact Support</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Reporting a bug? <Link to="/bug-reports/new" className="underline">Submit a bug report</Link> instead.
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm p-6">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit() }} className="flex flex-col gap-4">
          <Field label="Subject" required>
            <input
              className={inputClass}
              value={subject}
              onChange={e => setSubject(e.target.value)}
              required
              minLength={5}
              maxLength={200}
            />
          </Field>

          <Field label="Category" required>
            <select className={inputClass} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>

          <Field label="Message" required>
            <textarea
              className={inputClass}
              rows={6}
              value={body}
              onChange={e => setBody(e.target.value)}
              required
              minLength={10}
              maxLength={10000}
              placeholder="Describe your issue in detail…"
            />
          </Field>

          {error && <p className="text-sm text-destructive">{error.message}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <Link to="/support" className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isPending || !gameId}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}{required && <span className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
    </div>
  )
}
