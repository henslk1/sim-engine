import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import React, { useState } from "react"
import { z } from "zod"
import { trpc } from "@/lib/trpc"
import { Loader2 } from "lucide-react"

export const Route = createFileRoute('/_authenticated/bug-reports/new')({
  validateSearch: z.object({ from: z.string().optional() }),
  component: BugReportPage,
})

const CATEGORIES = [
  { value: "VISUAL" , label: "Visual" },
  { value: "TEXT", label: "Text" },
  { value: "UI", label: "UI" },
  { value: "GAMEPLAY", label: "Gameplay" },
  { value: "ECONOMY", label: "Economy" },
  { value: "PERFORMANCE", label: "Performance" },
] as const

const SEVERITIES = [
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "GAME_BREAKING", label: "Game Breaking" },
] as const

function BugReportPage() {
  const { from } = Route.useSearch()
  const navigate = useNavigate()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<string>("VISUAL")
  const [severity, setSeverity] = useState<string>("MINOR")
  const [pageUrl, setPageUrl] = useState(from ?? "")
  const [description, setDescription] = useState("")
  const [expectedOutcome, setExpectedOutcome] = useState("")
  const [stepsToReproduce, setStepsToReproduce] = useState("")
  const [errorMessages, setErrorMessages] = useState("")

  const { mutate, isPending, error } = trpc.bugReport.create.useMutation({
    onSuccess: () => navigate({ to: "/bug-reports" }),
  })

  function handleSubmit() {
    if (!gameId) return
    mutate({
      gameId,
      title,
      category: category as typeof CATEGORIES[number]["value"],
      severity: severity as typeof SEVERITIES[number]["value"],
      pageUrl,
      description,
      expectedOutcome,
      stepsToReproduce,
      errorMessages: errorMessages || undefined,
      screenshotUrls: []
    })
  }

  const inputClass = "w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-serif text-2xl font-semibold text-foreground mb-1">Report a Bug</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Found an exploit? Please <Link to="/support/new" className="underline">submit a support ticket</Link> instead.
      </p>

      <div className="rounded-lg border border-border bg-card shadow-sm p-6">
      <form onSubmit={(e) => { e.preventDefault(); handleSubmit()}} className="flex flex-col gap-4">
        <Field label="Title" required>
          <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} required minLength={5} maxLength={200} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required>
            <select className={inputClass} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Severity" required>
            <select className={inputClass} value={severity} onChange={e => setSeverity(e.target.value)}>
              {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Page URL" required>
          <input className={inputClass} value={pageUrl} onChange={e => setPageUrl(e.target.value)} required />
        </Field>

        <Field label="Description" required>
          <textarea className={inputClass} rows={4} value={description} onChange={e => setDescription(e.target.value)} required minLength={10} maxLength={5000} />
        </Field>

        <Field label="Expected Outcome" required>
          <textarea className={inputClass} rows={3} value={expectedOutcome} onChange={e => setExpectedOutcome(e.target.value)} required minLength={5} maxLength={2000} />
        </Field>

        <Field label="Steps to Reproduce" required>
          <textarea className={inputClass} rows={4} value={stepsToReproduce} onChange={e => setStepsToReproduce(e.target.value)} required minLength={5} maxLength={5000} />
        </Field>

        <Field label="Error Messages">
          <textarea className={inputClass} rows={2} value={errorMessages} onChange={e => setErrorMessages(e.target.value)} maxLength={2000} />
        </Field>

        {error && <p className="text-sm text-destructive">{error.message}</p>}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isPending || !gameId}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Submit Report"}
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
