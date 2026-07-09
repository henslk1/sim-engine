import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const toneBar: Record<string, string> = {
  energy:    "bg-amber-400",
  mood:      "bg-rose-400",
  condition: "bg-chart-2",
  care:      "bg-violet-400",
  immunity:  "bg-sky-400",
}

export function Meter({
  value,
  max,
  tone = "condition",
  className,
}: {
  value: number
  max: number
  tone?: "energy" | "mood" | "condition" | "care" | "immunity"
  className?: string
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div
        className={cn("h-full rounded-full transition-all", toneBar[tone] ?? "bg-primary")}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemax={max}
      />
    </div>
  )
}

type BadgeTone = "default" | "muted" | "accent" | "success" | "danger" | "outline"

const badgeTones: Record<BadgeTone, string> = {
  default: "bg-primary text-primary-foreground",
  muted: "bg-muted text-muted-foreground",
  accent: "bg-accent text-accent-foreground",
  success: "bg-chart-2/15 text-chart-2 ring-1 ring-chart-2/30",
  danger: "bg-destructive/12 text-destructive ring-1 ring-destructive/30",
  outline: "bg-transparent text-foreground ring-1 ring-border",
}

export function Badge({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Panel({
  title,
  icon,
  action,
  children,
  className,
  bodyClassName,
}: {
  title: string
  icon?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h3>
        {action}
      </header>
      <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", bodyClassName)}>{children}</div>
    </section>
  )
}

export function ActionButton({
  children,
  variant = "primary",
  disabled,
  className,
  title,
}: {
  children: ReactNode
  variant?: "primary" | "soft" | "ghost" | "danger"
  disabled?: boolean
  className?: string
  title?: string
}) {
  const variants = {
    primary: "bg-primary text-primary-foreground hover:bg-primary/90",
    soft: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
    ghost: "bg-transparent text-foreground hover:bg-secondary/60",
    danger: "bg-destructive/10 text-destructive hover:bg-destructive/20",
  }
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  )
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}
