import type { ReactNode } from "react"
import type { AnimalProfile } from "./types"
import { Badge } from "@/components/game/ui"
import { cn } from "@/lib/utils"
import { GitBranch, Trophy, Award, Star } from "lucide-react"
import { BREEDING_GRADE_COLOR, BREEDING_GRADE_BG } from "./utils"

export function InfoStrip({
  animal,
  cycleToAge,
  breedingGrade,
}: {
  animal: AnimalProfile
  cycleToAge: (n: number) => string
  breedingGrade: string
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5 border-b border-border bg-card/50 px-4 py-2">
      <InfoChip>{animal.breed.name}</InfoChip>
      <InfoChip>{animal.sex}</InfoChip>
      <InfoChip>{animal.lifeStage.name}</InfoChip>
      <InfoChip>Age {cycleToAge(animal.ageInCycles)}</InfoChip>
      {animal.breedGeneration !== null && (
        <InfoChip>
          <GitBranch className="size-3" /> Gen {animal.breedGeneration}
        </InfoChip>
      )}
      {animal.brands.map((b: AnimalProfile["brands"][number]) => (
        <BrandChip key={b.id} path={b.playerBrand.path} />
      ))}
      <span
        className={cn("inline-flex items-center justify-center rounded-md px-2 py-1", BREEDING_GRADE_BG[breedingGrade])}
        title={`Breeding quality: ${breedingGrade}`}
      >
        <Star className={cn("size-3", BREEDING_GRADE_COLOR[breedingGrade])} fill="currentColor" />
      </span>
      {animal.disciplineDef && (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
          <Trophy className="size-3 text-chart-1" /> {animal.disciplineDef.name}
        </span>
      )}
      {animal.titles.map((t: AnimalProfile["titles"][number]) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-semibold text-accent-foreground"
        >
          <Award className="size-3" /> {t.titleDef.name}
        </span>
      ))}
    </div>
  )
}

export function InfoChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary/60 px-2 py-1 text-xs font-medium text-secondary-foreground">
      {children}
    </span>
  )
}

export function BrandChip({ path }: { path: string }) {
  return (
    <span className="inline-flex items-center justify-center rounded-md bg-secondary/60 p-1" title="Player brand">
      <svg
        viewBox="0 0 100 100"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={path} />
      </svg>
    </span>
  )
}
