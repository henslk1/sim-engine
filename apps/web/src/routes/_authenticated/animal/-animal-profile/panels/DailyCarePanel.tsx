import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Badge, ActionButton } from "@/components/game/ui"
import { Heart, CheckCircle, Ban, CalendarClock, AlertTriangle, Loader2, CheckCircle2, Store } from "lucide-react"
import { getActiveRestrictions } from "../utils"
import { cn } from "@/lib/utils"
import { trpc } from "@/lib/trpc"
import { Link } from "@tanstack/react-router"

type CareAction = AnimalProfile["game"]["careActionDefs"][number]
type LTRecord = AnimalProfile["longTermCareRecords"][number]

function CostBadge({ action }: { action: CareAction }) {
  if (action.costType === "FREE") return <Badge tone="muted">Free</Badge>
  if (action.costType === "CURRENCY" && action.currencyAmount)
    return <Badge tone="outline">{action.currencyAmount}G</Badge>
  if (action.costType === "ITEM" && action.items.length > 0)
    return (
      <Badge tone="outline">
        {action.items.map((i) => `${i.quantity} ${i.itemDef.name}`).join(" + ")}
      </Badge>
    )
  return <Badge tone="muted">{action.costType}</Badge>
}

export function DailyCarePanel({ animal, playerAccountId }: { animal: AnimalProfile; playerAccountId: string }) {
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [ltcPendingId, setLtcPendingId] = useState<string | null>(null)
  const utils = trpc.useUtils()
  const invalidate = () => {
    utils.animalProfile.get.invalidate({ animalId: animal.id })
    utils.inventory.mine.invalidate({ playerAccountId })
  }
  const { mutate: performCare } = trpc.care.perform.useMutation({
    onMutate: ({ careActionDefId }) => setPendingId(careActionDefId),
    onSettled: () => {
      setPendingId(null)
      invalidate()
    },
  })
  const { mutate: performLtc } = trpc.care.performLtc.useMutation({
    onMutate: ({ ltcRecordId }) => setLtcPendingId(ltcRecordId),
    onSettled: () => {
      setLtcPendingId(null)
      invalidate()
    },
  })

  const { data: inventory } = trpc.inventory.mine.useQuery({ playerAccountId })

  function hasItems(action: CareAction) {
    if (action.costType !== "ITEM" || !inventory) return true
    return action.items.every((i) => {
      const slot = inventory.find((s) => s.itemDef.id === i.itemDef.id)
      return slot && slot.quantity >= i.quantity
    })
  }

  const restrictions = getActiveRestrictions(animal)
  const careRestricted = restrictions.has("CARE_ACTION") || restrictions.has("ALL")

  const doneIds = new Set(
    animal.careLogs
      .filter((l) => l.cycleNumber === animal.ageInCycles)
      .map((l) => l.careActionDefId)
  )

  const total = animal.game.careActionDefs.length
  const doneCount = animal.game.careActionDefs.filter((a) => doneIds.has(a.id)).length
  const allDone = doneCount === total && total > 0

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex shrink-0 items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Heart className="size-4 text-chart-4" />
          <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">Daily Care</h3>
        </div>
        {total > 0 && (
          <span className={cn(
            "text-[11px] font-semibold tabular-nums",
            allDone ? "text-chart-2" : "text-muted-foreground"
          )}>
            {allDone ? "Completed" : `${doneCount}/${total} today`}
          </span>
        )}
      </header>

      <div className="flex-1 overflow-auto p-3 space-y-3">
        {/* Daily actions */}
        {animal.game.careActionDefs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No care actions configured</p>
        ) : (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Daily Actions
            </h4>
            {careRestricted && (
              <div className="mb-2 flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                <Ban className="size-3 shrink-0" />
                Care actions restricted due to active treatment
              </div>
            )}
            <div className="space-y-1.5">
              {animal.game.careActionDefs.map((action: CareAction) => {
                const isDone = doneIds.has(action.id)
                const isFree = action.costType === "FREE"
                const isPending = pendingId === action.id
                return (
                  <div
                    key={action.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {isDone && <CheckCircle className="size-3.5 shrink-0 text-chart-2" />}
                      <span className={cn(
                        "text-xs font-semibold",
                        isDone ? "text-muted-foreground" : "text-foreground"
                      )}>
                        {action.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <CostBadge action={action} />
                      {isDone ? (
                        <span className="text-[11px] font-medium text-chart-2">Done</span>
                      ) : !careRestricted && !hasItems(action) ? (
                        <Link to="/shop">
                          <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">
                            <Store className="size-3" /> Visit Store
                          </ActionButton>
                        </Link>
                      ) : !careRestricted ? (
                        <ActionButton
                          variant="soft"
                          disabled={isPending}
                          className="h-6 px-2 text-[11px]"
                          onClick={() => performCare({
                            animalId: animal.id,
                            careActionDefId: action.id,
                            playerAccountId: isFree ? undefined : playerAccountId,
                          })}
                        >
                          {isPending ? <Loader2 className="size-3 animate-spin" /> : "Perform"}
                        </ActionButton>
                      ) : (
                        <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">
                          Perform
                        </ActionButton>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Long-term care schedule */}
        {animal.longTermCareRecords.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Long-Term Schedule
            </h4>
            <div className="space-y-1.5">
              {animal.longTermCareRecords.map((record: LTRecord) => {
                const isOverdue = animal.ageInCycles > record.nextDueCycle
                return (
                  <div
                    key={record.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5"
                  >
                    <p className="text-xs font-semibold text-foreground">{record.longTermCareActionDef.name}</p>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {isOverdue ? (
                        <Badge tone="danger">
                          <AlertTriangle className="size-3" /> Overdue
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">
                          in {record.nextDueCycle - animal.ageInCycles} cycles
                        </span>
                      )}
                      {record.longTermCareActionDef.currencyAmount != null && record.longTermCareActionDef.currencyAmount > 0 && (
                        <span className="text-[10px] text-muted-foreground">{record.longTermCareActionDef.currencyAmount}G</span>
                      )}
                      {animal.ageInCycles >= record.nextDueCycle ? (
                        <ActionButton
                          variant="soft"
                          className="h-6 px-2 text-[11px]"
                          disabled={ltcPendingId === record.id || careRestricted}
                          onClick={() => performLtc({ animalId: animal.id, ltcRecordId: record.id, playerAccountId })}
                        >
                          {ltcPendingId === record.id
                            ? <Loader2 className="size-3 animate-spin" />
                            : <CheckCircle2 className="size-3" />}
                          Perform
                        </ActionButton>
                      ) : (
                        <span className="text-[11px] font-medium text-chart-2">Done</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
