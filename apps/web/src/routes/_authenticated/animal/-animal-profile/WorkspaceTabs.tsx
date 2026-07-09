import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { cn } from "@/lib/utils"
import { Network, Dna, Trophy, Baby, TrendingUp } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { AnimalProfile } from "./types"
import { PedigreeTab } from "./tabs/PedigreeTab"
import { GeneticsTab } from "./tabs/GeneticsTab"
import { CompHistoryTab } from "./tabs/CompHistoryTab"
import { OffspringTab } from "./tabs/OffspringTab"
import { StatHistoryTab } from "./tabs/StatHistoryTab"

type WorkspaceTab = "pedigree" | "genetics" | "comp-history" | "offspring" | "stat-history"

const WORKSPACE_TABS: { id: WorkspaceTab; label: string; Icon: LucideIcon }[] = [
  { id: "pedigree", label: "Pedigree", Icon: Network },
  { id: "genetics", label: "Genetics", Icon: Dna },
  { id: "comp-history", label: "Comp. History", Icon: Trophy },
  { id: "offspring", label: "Offspring", Icon: Baby },
  { id: "stat-history", label: "Stat History", Icon: TrendingUp },
]

export function WorkspaceTabs({
  animal,
  animalId,
  cycleToAge,
  config,
}: {
  animal: AnimalProfile
  animalId: string
  cycleToAge: (n: number) => string
  config: AnimalProfile["game"]["gameConfig"]
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("genetics")

  const { data: offspring, isLoading: offspringLoading } = trpc.animalProfile.getOffspring.useQuery(
    { animalId },
    { enabled: activeTab === "offspring" }
  )
  const { data: statHistory, isLoading: statHistoryLoading } = trpc.animalProfile.getStatHistory.useQuery(
    { animalId },
    { enabled: activeTab === "stat-history" }
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-1 border-b border-border bg-secondary/40 px-2 py-1.5">
        {WORKSPACE_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors",
              activeTab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
      <div className="mx-auto w-full max-w-4xl min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === "pedigree" && <PedigreeTab animal={animal} />}
        {activeTab === "genetics" && <GeneticsTab animal={animal} config={config} />}
        {activeTab === "comp-history" && <CompHistoryTab animal={animal} cycleToAge={cycleToAge} />}
        {activeTab === "offspring" && <OffspringTab data={offspring} isLoading={offspringLoading} cycleToAge={cycleToAge} />}
        {activeTab === "stat-history" && <StatHistoryTab data={statHistory} isLoading={statHistoryLoading} />}
      </div>
    </div>
  )
}
