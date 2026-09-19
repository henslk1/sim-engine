import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const [email, setEmail]   = useState("")
  const [sent, setSent]     = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setError(null)
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })
    if (error) {
      setError(error.message ?? "Failed to send reset email")
      setPending(false)
      return
    }
    setSent(true)
    setPending(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-2 font-serif text-2xl font-semibold text-foreground">Forgot password</h1>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              If an account with that email exists, a reset link has been sent. Check your inbox.
            </p>
            <Link to="/login" className="block text-center text-sm font-medium text-primary hover:underline">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Enter your email and we'll send you a password reset link.
            </p>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send reset link"}
            </Button>
            <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  )
}
