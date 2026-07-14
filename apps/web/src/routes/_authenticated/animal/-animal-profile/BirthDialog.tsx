import { useState, useEffect } from "react"
import { trpc } from "@/lib/trpc"
import { Dialog, ActionButton } from "@/components/game/ui"
import { Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export function BirthDialog({
  pregnancyId,
  onClose,
  onBorn,
}: {
  pregnancyId: string
  onClose: () => void
  onBorn: () => void
}) {
  const { data: pregnancy, isLoading } = trpc.breeding.pregnancy.getForBirth.useQuery({ pregnancyId })
  const [names, setNames] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!pregnancy) return
    setNames((prev) => {
      const next = { ...prev }
      for (const o of pregnancy.offspring) {
        if (!(o.animal.id in next)) next[o.animal.id] = ""
      }
      return next
    })
  }, [pregnancy])

  const { mutate: birth, isPending } = trpc.breeding.pregnancy.birth.useMutation({
    onSuccess: () => {
      onBorn()
      onClose()
    },
  })

  const submit = (useDefaults = false) => {
    const nameEntries = useDefaults
      ? undefined
      : Object.entries(names)
          .filter(([, v]) => v.trim().length > 0)
          .map(([animalId, name]) => ({ animalId, name: name.trim() }))
    birth({ pregnancyId, names: nameEntries })
  }

  const unborn = pregnancy?.offspring.filter((o) => o.animal.status === "EMBRYO_STORED") ?? []

  return (
    <Dialog
      open
      onClose={onClose}
      title={unborn.length === 1 ? "A foal has arrived" : `${unborn.length} foals have arrived`}
    >
      <div className="space-y-4 p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              Name your foals or leave blank to use the default name.
            </p>

            <div className="space-y-3">
              {unborn.map((o, i) => (
                <div key={o.animal.id} className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2.5">
                  {/* Image placeholder */}
                  <div className="size-12 shrink-0 rounded-md border border-border/50 bg-secondary/60 flex items-center justify-center">
                    <Sparkles className={cn("size-4", o.animal.sex === "MALE" ? "text-sky-400" : "text-rose-400")} />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-[11px] font-semibold capitalize text-foreground">
                      Foal {i + 1} · {o.animal.sex.toLowerCase()}
                      {o.animal.phenotypeDescription && (
                        <span className="ml-1.5 font-normal text-muted-foreground">· {o.animal.phenotypeDescription}</span>
                      )}
                    </p>
                    <input
                      type="text"
                      value={names[o.animal.id] ?? ""}
                      maxLength={100}
                      onChange={(e) => setNames((prev) => ({ ...prev, [o.animal.id]: e.target.value }))}
                      placeholder="Unnamed Foal"
                      className="w-full rounded border border-input bg-background px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 border-t border-border pt-3">
              <ActionButton
                variant="soft"
                className="flex-1 justify-center text-muted-foreground"
                disabled={isPending}
                onClick={() => submit(true)}
              >
                Skip naming
              </ActionButton>
              <ActionButton
                variant="primary"
                className="flex-1 justify-center"
                disabled={isPending}
                onClick={() => submit(false)}
              >
                {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                Confirm
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}
