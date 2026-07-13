import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Dialog, ActionButton } from "@/components/game/ui"
import { RichTextEditor } from "@/components/game/editor/RichTextEditor"
import { trpc } from "@/lib/trpc"
import { Loader2 } from "lucide-react"

export function CreateListingDialog({
  animal,
  onClose,
  onCreated,
}: {
  animal: AnimalProfile
  onClose: () => void
  onCreated: () => void
}) {
  const currencies = animal.game.currencyDefs ?? []
  const [pricePerSlot, setPricePerSlot] = useState(0)
  const [currencyDefId, setCurrencyDefId] = useState(currencies[0]?.id ?? "")
  const [description, setDescription] = useState<object | null>(null)

  const { mutate: createListing, isPending, error } = trpc.breeding.listing.create.useMutation({
    onSuccess: () => { onCreated(); onClose() },
  })

  function handleSubmit() {
    createListing({
      animalId: animal.id,
      pricePerSlot,
      currencyDefId: pricePerSlot > 0 && currencyDefId ? currencyDefId : undefined,
      description: description ?? undefined,
    })
  }

  return (
    <Dialog open onClose={onClose} title="Create Breeding Listing">
      <div className="space-y-4 p-4">

        {/* Price per slot */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Price per slot
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={pricePerSlot}
              onChange={(e) => setPricePerSlot(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-28 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {pricePerSlot > 0 && currencies.length > 0 ? (
              <select
                value={currencyDefId}
                onChange={(e) => setCurrencyDefId(e.target.value)}
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {currencies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.symbol ? `${c.symbol} ${c.name}` : c.name}
                  </option>
                ))}
              </select>
            ) : pricePerSlot === 0 ? (
              <span className="text-[11px] text-muted-foreground">Free</span>
            ) : null}
          </div>
        </div>

        {/* Ad description */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stud ad
          </label>
          <RichTextEditor
            placeholder="Write your stud ad…"
            onChange={(json) => setDescription(json)}
            minHeight="10rem"
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-[11px] text-destructive">
            {error.message}
          </p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <ActionButton variant="soft" onClick={onClose} disabled={isPending}>
            Cancel
          </ActionButton>
          <ActionButton variant="primary" onClick={handleSubmit} disabled={isPending}>
            {isPending && <Loader2 className="size-3.5 animate-spin" />}
            Create Listing
          </ActionButton>
        </div>
      </div>
    </Dialog>
  )
}
