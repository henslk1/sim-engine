import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Dialog, ActionButton } from "@/components/game/ui"
import { RichTextEditor } from "@/components/game/editor/RichTextEditor"
import { trpc } from "@/lib/trpc"
import { Loader2 } from "lucide-react"

type Listing = NonNullable<AnimalProfile["breedingListings"][number]>

export function CreateListingDialog({
  animal,
  listing,
  onClose,
  onSaved,
}: {
  animal: AnimalProfile
  listing?: Listing
  onClose: () => void
  onSaved: () => void
}) {
  const isEditing = !!listing
  const currencies = animal.game.currencyDefs ?? []
  const gameBreeds = animal.game.breeds ?? []
  const statDefs = animal.stats.map((s) => s.statDef)

  const { data: titleDefs } = trpc.admin.title.list.useQuery({ gameId: animal.gameId })

  const [title, setTitle] = useState(listing?.title ?? "")
  const [pureBredOnly, setPureBredOnly] = useState(listing?.pureBredOnly ?? false)
  const [requiredTitleDefId, setRequiredTitleDefId] = useState(listing?.requiredTitleDefId ?? "")
  const [pricePerSlot, setPricePerSlot] = useState(listing?.pricePerSlot ?? 0)
  const [currencyDefId, setCurrencyDefId] = useState(listing?.currencyDef?.id ?? currencies[0]?.id ?? "")
  const [description, setDescription] = useState<object | null>(
    listing?.description ? (listing.description as object) : null
  )
  const [breedRestrictionIds, setBreedRestrictionIds] = useState<Set<string>>(
    new Set(listing?.breedRestrictions.map((r) => r.breedId) ?? [])
  )
  const [statMinimums, setStatMinimums] = useState<Record<string, number>>(
    Object.fromEntries(listing?.statMinimums.map((sm) => [sm.statDefId, sm.minValue]) ?? [])
  )

  const { mutate: createListing, isPending: createPending, error: createError } =
    trpc.breeding.listing.create.useMutation({ onSuccess: () => { onSaved(); onClose() } })

  const { mutate: updateListing, isPending: updatePending, error: updateError } =
    trpc.breeding.listing.update.useMutation({ onSuccess: () => { onSaved(); onClose() } })

  const isPending = createPending || updatePending
  const error = createError ?? updateError

  function toggleBreed(breedId: string) {
    setBreedRestrictionIds((prev) => {
      const next = new Set(prev)
      if (next.has(breedId)) next.delete(breedId)
      else next.add(breedId)
      return next
    })
  }

  function setStatMin(statDefId: string, value: number) {
    setStatMinimums((prev) => {
      const next = { ...prev }
      if (value <= 0) delete next[statDefId]
      else next[statDefId] = value
      return next
    })
  }

  function handleSubmit() {
    const restrictions = Array.from(breedRestrictionIds)
    const minimums = Object.entries(statMinimums)
      .filter(([, v]) => v > 0)
      .map(([statDefId, minValue]) => ({ statDefId, minValue }))

    const shared = {
      title: title.trim() || undefined,
      pureBredOnly,
      requiredTitleDefId: requiredTitleDefId || undefined,
      pricePerSlot,
      currencyDefId: pricePerSlot > 0 && currencyDefId ? currencyDefId : undefined,
      description: description ?? undefined,
      breedRestrictions: restrictions,
      statMinimums: minimums,
    }

    if (isEditing) {
      updateListing({ listingId: listing.id, ...shared })
    } else {
      createListing({ animalId: animal.id, ...shared })
    }
  }

  return (
    <Dialog open onClose={onClose} title={isEditing ? "Edit Breeding Listing" : "Create Breeding Listing"}>
      <div className="max-h-[80vh] overflow-y-auto space-y-4 p-4">

        {/* Ad title */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Ad title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Champion bloodline — open for bookings"
            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {/* Purebred only + required title */}
        <div className="flex flex-wrap items-start gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={pureBredOnly}
              onChange={(e) => setPureBredOnly(e.target.checked)}
              className="rounded border-input accent-primary"
            />
            <span className="text-sm">Purebred mares only</span>
          </label>
          {titleDefs && titleDefs.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Required title</span>
              <select
                value={requiredTitleDefId}
                onChange={(e) => setRequiredTitleDefId(e.target.value)}
                className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">None</option>
                {titleDefs.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

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

        {/* Breed restrictions */}
        {gameBreeds.length > 0 && (
          <div>
            <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Breed restrictions
            </label>
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              If none selected, any breed may use this listing.
            </p>
            <div className="space-y-1">
              {gameBreeds.map((breed) => (
                <label key={breed.id} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={breedRestrictionIds.has(breed.id)}
                    onChange={() => toggleBreed(breed.id)}
                    className="rounded border-input accent-primary"
                  />
                  <span className="text-sm">{breed.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Stat minimums */}
        {statDefs.length > 0 && (
          <div>
            <label className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Stat minimums
            </label>
            <p className="mb-1.5 text-[11px] text-muted-foreground">
              Total (innate + trained) required. Leave at 0 for no minimum.
            </p>
            <div className="space-y-1.5">
              {statDefs.map((stat) => (
                <div key={stat.id} className="flex items-center gap-2">
                  <span className="w-28 shrink-0 text-[11px] text-muted-foreground">{stat.name}</span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={statMinimums[stat.id] ?? 0}
                    onChange={(e) => setStatMin(stat.id, parseInt(e.target.value) || 0)}
                    className="w-20 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ad description */}
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Stud ad
          </label>
          <RichTextEditor
            defaultContent={listing?.description as object | undefined}
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
            {isEditing ? "Save Changes" : "Create Listing"}
          </ActionButton>
        </div>
      </div>
    </Dialog>
  )
}
