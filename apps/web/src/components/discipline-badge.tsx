import { cn } from "@/lib/utils"

interface DisciplineBadgeProps {
  name: string
  isConformation: boolean
  /** Only meaningful when isConformation is true — activates the badge when inspection is complete */
  inspected?: boolean
  className?: string
}

export function DisciplineBadge({
  name,
  isConformation,
  inspected = false,
  className,
}: DisciplineBadgeProps) {
  if (!isConformation) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground",
          className,
        )}
      >
        {name}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] transition-colors",
        inspected
          ? "border border-chart-3/25 bg-chart-3/12 text-chart-3"
          : "border border-dashed border-muted-foreground/30 text-muted-foreground/40",
        className,
      )}
    >
      {name}
    </span>
  )
}
