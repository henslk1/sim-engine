import type { AnimalProfile } from "../types"
import { formatCycleAge } from "../utils"
import { Badge } from "@/components/game/ui"
import { Skull } from "lucide-react"

export function BuriedView({ animal }: { animal: AnimalProfile }) {
  const config = animal.game.gameConfig
  const cycleToAge = (n: number) => formatCycleAge(n, config)

  return (
    
  )
}