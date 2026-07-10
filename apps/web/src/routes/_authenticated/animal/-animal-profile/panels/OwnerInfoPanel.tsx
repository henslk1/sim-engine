import type { AnimalProfile } from "../types"

export function OwnerInfoPanel({ animal }: { animal: AnimalProfile }) {
  const { playerAccount } = animal
  return (
    <div className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-secondary/40 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Owner</h3>
      </header>
      <div className="flex items-center gap-3 p-3">
        {playerAccount.avatar ? (
          <img
            src={playerAccount.avatar}
            alt={playerAccount.username}
            className="size-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
            {playerAccount.username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{playerAccount.username}</p>
          <a
            href={`/player/${playerAccount.id}`}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            View profile
          </a>
        </div>
      </div>
    </div>
  )
}
