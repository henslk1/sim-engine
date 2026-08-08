import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { z } from "zod"

export const Route = createFileRoute("/reset-password")({
  validateSearch: z.object({ token: z.string().optional() }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { token }   = Route.useSearch()
  const navigate    = useNavigate()
  const [password, setPassword]   = useState("")
  const [confirm, setConfirm]     = useState("")
  const [error, setError]         = useState<string | null>(null)
  const [pending, setPending]     = useState(false)

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <p className="text-sm text-destructive">Invalid or missing reset token.</p>
          <Link to="/forgot-password" className="mt-4 block text-sm font-medium text-primary hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError("Passwords do not match"); return }
    if (password.length < 8) { setError("Password must be at least 8 characters"); return }
    setPending(true)
    setError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token: token! })
    if (error) { setError(error.message ?? "Reset failed"); setPending(false); return }
    navigate({ to: "/login" })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-4 font-serif text-2xl font-semibold text-foreground">Reset password</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">New password</label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoFocus
              minLength={8}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-foreground">Confirm password</label>
            <Input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </Button>
        </form>
      </div>
    </div>
  )
}
