import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton } from "@/components/game/ui"
import { Baby, Sparkles, Heart, Ban, Dna, Scissors, Send, Plus, Syringe, FlaskConical, Scan, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCOIColor, getFertilityDisplay, getActiveRestrictions } from "../utils"

type BreedingTab = "info" | "covers"

export function BreedingPanel({
  animal,
  breedingGrade,
  readonly = false,
}: {
  animal: AnimalProfile
  breedingGrade: string
  readonly?: boolean
}) {
  const [tab, setTab] = useState<BreedingTab>("info")

  const preg = animal.pregnancies[0]
  const coiColor = getCOIColor(animal.inbreedingCoefficient)
  const fertility = getFertilityDisplay(animal.fertility)
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("BREEDING") || restrictions.has("ALL")
  const isMale = animal.sex === "MALE"
  const isFemale = animal.sex === "FEMALE"

  const isConceptionCycle = preg && preg.currentCycles === 0

  return (
    <Panel
      title="Breeding"
      icon={<Baby className="size-4 text-accent-foreground" />}
      action={
        !animal.isCastrated && !readonly ? (
          <div className="flex gap-0.5">
            {(["info", "covers"] as BreedingTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  tab === t
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "info" ? "Overview" : isFemale ? "Covers & Storage" : "Storage"}
              </button>
            ))}
          </div>
        ) : undefined
      }
    >
      {/* COI / Quality / Fertility row */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-border pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          COI —{" "}
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Quality — <span className="font-bold">{breedingGrade}</span>
        </span>
        <span className="flex items-center gap-0.5" title={`Fertility: ${fertility.label}`}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Heart
              key={i}
              className={cn("size-3", i < fertility.hearts ? "text-rose-400" : "text-muted-foreground/25")}
              fill="currentColor"
            />
          ))}
        </span>
        {animal.breedComposition.length > 1 && <Badge tone="muted">Cross</Badge>}
        {animal.isCastrated && <Badge tone="muted">Castrated</Badge>}
      </div>

      {isRestricted && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
          <Ban className="size-3 shrink-0" />
          Breeding restricted due to active treatment
        </div>
      )}

      {animal.isCastrated ? (
        <p className="text-[11px] text-muted-foreground">Not eligible for breeding</p>
      ) : tab === "info" ? (
        <div className="space-y-2">
          {/* Pregnancy status (female) */}
          {isFemale && (
            preg ? (
              <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Active Pregnancy</span>
                  <Badge tone="accent">
                    <Sparkles className="size-3" /> Expecting
                  </Badge>
                </div>
                {preg.breedingRecord.sire && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sire: <span className="font-medium text-foreground">{preg.breedingRecord.sire.name}</span>
                  </p>
                )}
                <div className="mt-2">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[11px] text-muted-foreground">Gestation</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {preg.currentCycles} / {preg.requiredCycles} cycles
                    </span>
                  </div>
                  <Meter value={preg.currentCycles} max={preg.requiredCycles} tone="mood" className="h-1.5" />
                </div>
                {!readonly && (
                  <div className="mt-2 flex gap-2">
                    {isConceptionCycle && (
                      <ActionButton variant="soft" disabled className="flex-1 justify-center">
                        <FlaskConical className="size-3.5" /> Flush Embryo
                      </ActionButton>
                    )}
                    <ActionButton variant="soft" disabled className="flex-1 justify-center">
                      <Scan className="size-3.5" /> Ultrasound
                    </ActionButton>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">Not pregnant</p>
                {!readonly && (
                  <ActionButton variant="soft" disabled className="w-full justify-center">
                    <Search className="size-3.5" /> Browse Stud Market
                  </ActionButton>
                )}
              </div>
            )
          )}

          {/* Male stud listing */}
          {isMale && !readonly && (
            <div className="space-y-1.5">
              <ActionButton variant="soft" disabled className="w-full justify-center">
                <Plus className="size-3.5" /> Add Breeding Slot
              </ActionButton>
              <div className="flex gap-2">
                <ActionButton variant="soft" disabled className="flex-1 justify-center">
                  Manage Listing
                </ActionButton>
                <ActionButton variant="soft" disabled className="flex-1 justify-center">
                  Toggle
                </ActionButton>
              </div>
            </div>
          )}

          {/* Send Cover (male) */}
          {isMale && !readonly && (
            <ActionButton variant="soft" disabled className="w-full justify-center">
              <Send className="size-3.5" /> Send Cover
            </ActionButton>
          )}

          {/* Genetic material */}
          {!readonly && (
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Genetic Material</span>
                <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">
                  View Storage
                </ActionButton>
              </div>
              <ActionButton variant="soft" disabled className="w-full justify-center">
                <Syringe className="size-3.5" />
                {isMale ? "Collect Sperm" : "Collect Egg / Embryo"}
              </ActionButton>
            </div>
          )}

          {/* Castrate (male only) */}
          {isMale && !readonly && (
            <ActionButton
              variant="soft"
              disabled
              className="w-full justify-center text-destructive hover:bg-destructive/10"
            >
              <Scissors className="size-3.5" /> Castrate
            </ActionButton>
          )}
        </div>
      ) : (
        /* Tab 2 — Covers & Storage */
        <div className="space-y-2">
          {isFemale && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Incoming Covers
              </h4>
              <p className="text-[11px] text-muted-foreground">No covers available</p>
            </div>
          )}
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Genetic Storage
            </h4>
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
              <Dna className="size-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">No stored material</span>
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}
