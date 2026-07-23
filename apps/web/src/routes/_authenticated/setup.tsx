import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Button } from "@/components/ui/button"

function SetupPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id

  const create = trpc.player.create.useMutation({
    onSuccess: async () => {
      await utils.player.me.invalidate()
      navigate({ to: "/dashboard" })
    },
  })

  const [username, setUsername] = useState("")

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gameId) return
    create.mutate({ gameId, username })
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground">Create Your Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a username to get started.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Username</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="e.g. silverstar_stables"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              minLength={3}
              maxLength={30}
              required
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">3–30 characters</p>
          </div>
          {create.error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <Button type="submit" disabled={create.isPending || !gameId} className="w-full">
            {create.isPending ? "Creating…" : "Get Started"}
          </Button>
        </form>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/setup")({
  component: SetupPage,
})
