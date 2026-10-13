import { Link } from "@tanstack/react-router"
import { pedigreeLayout, pedigreeRow } from "@/lib/pedigree-layout"
import type { AnimalProfile } from "../types"
import { Badge } from "@/components/game/ui"
import { cn } from "@/lib/utils"
import { getCOIColor } from "../utils"

type Ancestor = AnimalProfile["ancestors"][number]


function buildPositionMap(ancestors: Ancestor[]) {
  const map = new Map<number, Ancestor>()
  const byDepth = new Map<number, Ancestor[]>()

  for (const a of ancestors) {
    if (!byDepth.has(a.depth)) byDepth.set(a.depth, [])
    byDepth.get(a.depth)!.push(a)
  }

  for (const [depth, items] of byDepth) {
    const base = Math.pow(2, depth)
    const sorted = [...items].sort((a, b) => {
      if (a.position !== null && b.position !== null) return a.position - b.position
      if (a.position !== null) return -1
      if (b.position !== null) return 1
      if (a.ancestor.sex !== b.ancestor.sex) return a.ancestor.sex === "MALE" ? -1 : 1
      return 0
    })
    sorted.forEach((a, i) => {
      map.set(a.position ?? (base + i), a)
    })
  }

  return map
}

function centerYPct(position: number): string {
  const depth = Math.floor(Math.log2(position))
  const indexInDepth = position - Math.pow(2, depth)
  return `${((indexInDepth + 0.5) / Math.pow(2, depth)) * 100}%`
}

function PedigreeConnectors({ positionMap, columns }: { positionMap: Map<number, Ancestor>; columns: number[][] }) {
  const lines: React.ReactElement[] = []

  function addBranch(parentPos: number, c1r: string, mid: string, c2l: string) {
    if (!positionMap.has(parentPos)) return
    const child1 = parentPos * 2
    const child2 = parentPos * 2 + 1
    const pY = centerYPct(parentPos)
    const c1Y = centerYPct(child1)
    const c2Y = centerYPct(child2)

    // horizontal: parent → fork
    lines.push(<line key={`h0-${parentPos}`} x1={c1r} y1={pY} x2={mid} y2={pY} />)
    // vertical: fork bar
    lines.push(<line key={`v-${parentPos}`} x1={mid} y1={c1Y} x2={mid} y2={c2Y} />)
    // horizontal: fork → child 1
    if (positionMap.has(child1))
      lines.push(<line key={`h1-${child1}`} x1={mid} y1={c1Y} x2={c2l} y2={c1Y} />)
    // horizontal: fork → child 2
    if (positionMap.has(child2))
      lines.push(<line key={`h2-${child2}`} x1={mid} y1={c2Y} x2={c2l} y2={c2Y} />)
  }

  for (let column = 0; column < columns.length - 1; column++) {
    const boundary = ((column + 1) / columns.length) * 100
    for (const position of columns[column]!) {
      addBranch(position, `calc(${boundary}% - 0.5rem)`, `${boundary}%`, `calc(${boundary}% + 0.5rem)`)
    }
  }

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      style={{ stroke: "var(--border)", strokeWidth: 1, fill: "none", strokeOpacity: 0.6 }}
    >
      {lines}
    </svg>
  )
}

function PedigreeNode({ ancestor }: { ancestor: Ancestor }) {
  return (
    <div className="text-center">
      <Link
        to="/animal/$animalId"
        params={{ animalId: ancestor.ancestor.id }}
        className="block text-[11px] font-semibold text-foreground transition-colors hover:text-primary"
      >
        {ancestor.ancestor.name}
      </Link>
      <span className="block text-[10px] text-muted-foreground">
        {ancestor.ancestor.breed?.name ?? ""}
      </span>
    </div>
  )
}

function PedigreeColumn({
  positions,
  positionMap,
  rows,
}: {
  positions: number[]
  rows: number
  positionMap: Map<number, Ancestor>
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: `repeat(${rows}, 2.375rem)`,

      }}
    >
      {positions.map((pos) => {
        const ancestor = positionMap.get(pos)
        return (
          <div key={pos} style={{ gridRow: `${pedigreeRow(pos, rows).start} / span ${pedigreeRow(pos, rows).span}` }} className="flex items-center justify-center">
            {ancestor && <PedigreeNode ancestor={ancestor} />}
          </div>
        )
      })}
    </div>
  )
}

export function PedigreeTab({ animal }: { animal: AnimalProfile }) {
  const coiColor = getCOIColor(animal.inbreedingCoefficient)
  const { depth, rows, columns } = pedigreeLayout(animal.game.gameConfig?.pedigreeDisplayDepth)
  const ancestors = animal.ancestors.filter(a => a.depth <= depth)
  const positionMap = buildPositionMap(ancestors)

  return (
    <div>
      {animal.breedComposition.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {animal.breedComposition.map((bc: AnimalProfile["breedComposition"][number]) => (
            <Badge key={bc.breedId} tone="outline">
              {bc.breed?.name ?? ""} · {bc.percentage * 100 < 1 ? "< 1" : Math.round(bc.percentage * 100)}%
            </Badge>
          ))}
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-4 border-b border-border pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          COI —{" "}
          <span className={cn("font-bold tabular-nums", coiColor)}>
            {(animal.inbreedingCoefficient * 100).toFixed(2)}%
          </span>
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Born —{" "}
          <span className="font-bold text-foreground">{new Date(animal.bornAt).toLocaleDateString()}</span>
        </span>
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        Bred by{" "}
        <span className="font-medium text-foreground">{animal.breeder?.username ?? "Unknown"}</span>
      </p>

      {ancestors.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No pedigree on record.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${depth}, minmax(0, 1fr))`, minWidth: `${depth * 10}rem` }}>
            <PedigreeConnectors positionMap={positionMap} columns={columns} />
            {columns.map((positions, i) => (
              <div className="px-2" key={i}>
                <PedigreeColumn positions={positions} positionMap={positionMap} rows={rows} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
