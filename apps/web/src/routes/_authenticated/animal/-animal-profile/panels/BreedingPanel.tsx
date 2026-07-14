import { useState } from "react"
import type { AnimalProfile } from "../types"
import { Panel, Badge, Meter, ActionButton, Dialog } from "@/components/game/ui"
import { Baby, Sparkles, Heart, Ban, Dna, Scissors, Send, Plus, Syringe, FlaskConical, Scan, Search, Loader2, ChevronDown, ChevronUp, X } from "lucide-react"
import { CreateListingDialog } from "./CreateListingDialog"
import { cn } from "@/lib/utils"
import { getCOIColor, getFertilityDisplay, getActiveRestrictions } from "../utils"
import { trpc } from "@/lib/trpc"
import { Link, useNavigate } from "@tanstack/react-router"

type BreedingTab = "info" | "covers"
type StorageType = "PERSONAL" | "VET" | "GROUP"
type CoverTab = "own" | "player"

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
  const [storageType, setStorageType] = useState<StorageType>("PERSONAL")
  const [confirmCastrate, setConfirmCastrate] = useState(false)
  const [actioningOfferId, setActioningOfferId] = useState<string | null>(null)
  const [listingDialogOpen, setListingDialogOpen] = useState(false)
  const [editListingOpen, setEditListingOpen] = useState(false)
  const [sendCoverOpen, setSendCoverOpen] = useState(false)
  const [coverTab, setCoverTab] = useState<CoverTab>("own")
  const [selectedDamId, setSelectedDamId] = useState("")
  const [playerUsername, setPlayerUsername] = useState("")
  const [usernameSearch, setUsernameSearch] = useState("")
  const [coverPrice, setCoverPrice] = useState(0)

  const utils = trpc.useUtils()
  const navigate = useNavigate()
  const invalidate = () => utils.animalProfile.get.invalidate({ animalId: animal.id })

  const { mutate: flushEmbryo, isPending: flushPending } =
    trpc.breeding.material.flushEmbryo.useMutation({ onSettled: invalidate })
  const { mutate: ultrasound, isPending: ultrasoundPending } =
    trpc.breeding.pregnancy.ultrasound.useMutation({ onSettled: invalidate })
  const { mutate: collectMaterial, isPending: collectPending, error: collectError } =
    trpc.breeding.material.collectMaterial.useMutation({ onSettled: invalidate })
  const { mutate: castrate, isPending: castratePending } =
    trpc.animal.castrate.useMutation({
      onSuccess: () => { setConfirmCastrate(false); invalidate() },
    })

  const preg = animal.pregnancies.find((p) => !p.isCompleted) ?? null
  const coiColor = getCOIColor(animal.inbreedingCoefficient)
  const fertility = getFertilityDisplay(animal.fertility)
  const restrictions = getActiveRestrictions(animal)
  const isRestricted = restrictions.has("BREEDING") || restrictions.has("ALL")
  const isMale = animal.sex === "MALE"
  const isFemale = animal.sex === "FEMALE"

  const { data: ownFemales } = trpc.breeding.cover.listEligibleOwn.useQuery(
    { sireId: animal.id },
    { enabled: isMale && sendCoverOpen && coverTab === "own" }
  )
  const { data: playerResult, isFetching: lookupFetching } = trpc.breeding.cover.lookupPlayerFemales.useQuery(
    { username: usernameSearch, gameId: animal.gameId, excludePlayerAccountId: animal.playerAccountId },
    { enabled: isMale && sendCoverOpen && coverTab === "player" && usernameSearch.length > 0 }
  )
  const { mutate: sendCover, isPending: sendCoverPending, error: sendCoverError } = trpc.breeding.cover.send.useMutation({
    onSuccess: () => {
      setSendCoverOpen(false)
      setSelectedDamId("")
      setPlayerUsername("")
      setUsernameSearch("")
      setCoverPrice(0)
      invalidate()
    },
  })
  const { mutate: toggleListing, isPending: toggleListingPending } =
    trpc.breeding.listing.toggleActive.useMutation({ onSettled: invalidate })
  const { mutate: addSlot, isPending: addSlotPending, error: addSlotError } =
    trpc.breeding.listing.addSlot.useMutation({ onSettled: invalidate })

  const { mutate: declineCover } =
    trpc.breeding.cover.decline.useMutation({
      onSettled: () => { setActioningOfferId(null); invalidate() },
    })
  const listing = animal.breedingListings[0] ?? null
  const canBreed = animal.lifeStage.canBreed
  const canSurrogate = animal.lifeStage.canSurrogate

  const openCycle = animal.game.gameConfig?.ultrasoundOpenCycle ?? 0
  const ultrasoundWindowOpen = !!preg && preg.currentCycles >= openCycle
  const canUltrasound = !!preg && !preg.ultrasoundUsed && !isRestricted && ultrasoundWindowOpen

  return (
    <Panel
      title="Breeding"
      icon={<Baby className="size-4 text-accent-foreground" />}
      action={
        canBreed && !animal.isCastrated && !readonly ? (
          <div className="flex gap-0.5">
            {(["info", "covers"] as BreedingTab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                  tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "info" ? "Overview" : (
                  <>
                    {isFemale ? "Covers & Storage" : "Pending Covers"}
                    {(isFemale ? animal.coverOffersAsDam.length : animal.coverOffersAsSire.length) > 0 && (
                      <span className="ml-1 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                        {isFemale ? animal.coverOffersAsDam.length : animal.coverOffersAsSire.length}
                      </span>
                    )}
                  </>
                )}
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

      {animal.isCastrated || (!canBreed && !canSurrogate) ? (
        <p className="text-[11px] text-muted-foreground">
          {animal.isCastrated ? "Not eligible for breeding." : "Not available at this life stage."}
        </p>
      ) : canBreed && tab === "info" ? (
        <div className="space-y-2">

          {/* Pregnancy block (female) */}
          {isFemale && (
            preg ? (
              <div className="rounded-md border border-border/70 bg-secondary/30 px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">Active Pregnancy</span>
                  <Badge tone="accent"><Sparkles className="size-3" /> Expecting</Badge>
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

                {preg.ultrasoundUsed && preg.offspring.length > 0 && (
                  <div className="mt-2 space-y-1 border-t border-border/50 pt-2">
                    <span className="text-[11px] font-semibold text-muted-foreground">Ultrasound</span>
                    {preg.offspring.map((o) => (
                      <div key={o.animal.id} className="flex items-center gap-1.5 text-[11px]">
                        <Sparkles className="size-3 shrink-0 text-accent-foreground" />
                        <span className="font-medium capitalize text-foreground">{o.animal.sex.toLowerCase()}</span>
                        {o.animal.phenotypeDescription && (
                          <span className="text-muted-foreground">· {o.animal.phenotypeDescription}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {!readonly && (
                  <div className="mt-2 flex gap-2">
                    {preg.currentCycles === 0 && (
                      <ActionButton
                        variant="soft"
                        className="flex-1 justify-center"
                        disabled={flushPending || isRestricted}
                        onClick={() => flushEmbryo({ pregnancyId: preg.id })}
                      >
                        {flushPending
                          ? <Loader2 className="size-3.5 animate-spin" />
                          : <FlaskConical className="size-3.5" />}
                        Flush Embryo
                      </ActionButton>
                    )}
                    <ActionButton
                      variant="soft"
                      className="flex-1 justify-center"
                      disabled={!canUltrasound || ultrasoundPending}
                      title={!ultrasoundWindowOpen && !preg.ultrasoundUsed ? `Available at gestation cycle ${openCycle}` : undefined}
                      onClick={() => ultrasound({ pregnancyId: preg.id })}
                    >
                      {ultrasoundPending
                        ? <Loader2 className="size-3.5 animate-spin" />
                        : <Scan className="size-3.5" />}
                      {preg.ultrasoundUsed
                        ? "Ultrasound Used"
                        : !ultrasoundWindowOpen
                        ? `Ultrasound (cycle ${openCycle})`
                        : "Ultrasound"}
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
            <div>
              {listing ? (
                <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Breeding Listing</span>
                    <Badge tone={listing.isActive ? "success" : "muted"}>
                      {listing.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex gap-3 text-[11px] text-muted-foreground">
                    <span>
                      {listing.pricePerSlot > 0
                        ? `${listing.pricePerSlot}${listing.currencyDef?.symbol ? ` ${listing.currencyDef.symbol}` : ""} / slot`
                        : "Free"}
                    </span>
                    <span>
                      {listing.slots.filter((s) => s.status === "AVAILABLE").length} available ·{" "}
                      {listing.slots.filter((s) => s.status === "USED").length} used
                    </span>
                  </div>
                  {(() => {
                    const availableSlots = listing.slots.filter((s) => s.status === "AVAILABLE").length
                    const maxSlots = animal.game.gameConfig?.maxBreedingSlots ?? null
                    const atCap = maxSlots !== null && availableSlots >= maxSlots
                    return (
                      <>
                        <ActionButton
                          variant="soft"
                          className="w-full justify-center"
                          disabled={addSlotPending || !listing.isActive || isRestricted || atCap}
                          onClick={() => addSlot({ listingId: listing.id })}
                        >
                          {addSlotPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                          Add Slot
                          {(animal.game.gameConfig?.breedingEnergyCost ?? 0) > 0 && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              -{animal.game.gameConfig!.breedingEnergyCost} energy
                            </span>
                          )}
                        </ActionButton>
                        {atCap && (
                          <p className="text-[11px] text-muted-foreground">
                            Maximum slots reached ({maxSlots}/{maxSlots}). Use an item to raise the cap.
                          </p>
                        )}
                        {addSlotError && (
                          <p className="text-[11px] text-destructive">{addSlotError.message}</p>
                        )}
                      </>
                    )
                  })()}
                  <div className="flex gap-1.5">
                    <ActionButton
                      variant="soft"
                      className="flex-1 justify-center"
                      onClick={() => setEditListingOpen(true)}
                    >
                      Edit
                    </ActionButton>
                    <ActionButton
                      variant="soft"
                      className="flex-1 justify-center"
                      disabled={toggleListingPending}
                      onClick={() => toggleListing({ listingId: listing.id })}
                    >
                      {toggleListingPending && <Loader2 className="size-3.5 animate-spin" />}
                      {listing.isActive ? "Deactivate" : "Activate"}
                    </ActionButton>
                  </div>
                </div>
              ) : (
                <ActionButton
                  variant="soft"
                  className="w-full justify-center"
                  disabled={isRestricted}
                  onClick={() => setListingDialogOpen(true)}
                >
                  <Plus className="size-3.5" /> Create Breeding Listing
                </ActionButton>
              )}
            </div>
          )}

          {listingDialogOpen && (
            <CreateListingDialog
              animal={animal}
              onClose={() => setListingDialogOpen(false)}
              onSaved={invalidate}
            />
          )}
          {editListingOpen && listing && (
            <CreateListingDialog
              animal={animal}
              listing={listing}
              onClose={() => setEditListingOpen(false)}
              onSaved={invalidate}
            />
          )}

          {/* Send Cover (male) */}
          {isMale && !readonly && (
            <div>
              <ActionButton
                variant="soft"
                className="w-full justify-center"
                disabled={isRestricted}
                onClick={() => { setSendCoverOpen((o) => !o); setSelectedDamId(""); setCoverTab("own") }}
              >
                <Send className="size-3.5" /> Send Cover
                {sendCoverOpen ? <ChevronUp className="size-3.5 ml-auto" /> : <ChevronDown className="size-3.5 ml-auto" />}
              </ActionButton>

              {sendCoverOpen && (
                <div className="mt-1.5 rounded-md border border-border/70 bg-secondary/20 px-2.5 py-2 space-y-2">
                  {/* Cover sub-tabs */}
                  <div className="flex gap-0.5">
                    {(["own", "player"] as CoverTab[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => { setCoverTab(t); setSelectedDamId("") }}
                        className={cn(
                          "flex-1 rounded px-2 py-0.5 text-[11px] font-semibold transition-colors",
                          coverTab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {t === "own" ? "Own Females" : "To Player"}
                      </button>
                    ))}
                  </div>

                  {coverTab === "own" && (
                    <div className="space-y-1.5">
                      <select
                        value={selectedDamId}
                        onChange={(e) => setSelectedDamId(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Select a female…</option>
                        {ownFemales?.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name} · {f.breed.name} · {f.lifeStage.name}
                          </option>
                        ))}
                      </select>
                      {ownFemales?.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">No eligible females found.</p>
                      )}
                      <ActionButton
                        variant="soft"
                        className="w-full justify-center"
                        disabled={!selectedDamId || sendCoverPending}
                        onClick={() => selectedDamId && sendCover({ sireId: animal.id, damId: selectedDamId, price: 0 })}
                      >
                        {sendCoverPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        Confirm Cover
                      </ActionButton>
                    </div>
                  )}

                  {coverTab === "player" && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          value={playerUsername}
                          onChange={(e) => setPlayerUsername(e.target.value)}
                          placeholder="Username…"
                          className="min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                        <ActionButton
                          variant="soft"
                          className="shrink-0"
                          disabled={!playerUsername.trim() || lookupFetching}
                          onClick={() => { setUsernameSearch(playerUsername.trim()); setSelectedDamId("") }}
                        >
                          {lookupFetching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                        </ActionButton>
                      </div>

                      {usernameSearch && playerResult === null && (
                        <p className="text-[11px] text-muted-foreground">Player not found.</p>
                      )}

                      {playerResult && (
                        <>
                          <select
                            value={selectedDamId}
                            onChange={(e) => setSelectedDamId(e.target.value)}
                            className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                          >
                            <option value="">Select a female…</option>
                            {playerResult.females.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name} · {f.breed.name} · {f.lifeStage.name}
                              </option>
                            ))}
                          </select>
                          {playerResult.females.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">No eligible females for this player.</p>
                          )}
                          <div>
                            <label className="mb-0.5 block text-[11px] text-muted-foreground">Stud fee</label>
                            <input
                              type="number"
                              min={0}
                              value={coverPrice}
                              onChange={(e) => setCoverPrice(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          </div>
                          <ActionButton
                            variant="soft"
                            className="w-full justify-center"
                            disabled={!selectedDamId || sendCoverPending}
                            onClick={() => selectedDamId && sendCover({ sireId: animal.id, damId: selectedDamId, price: coverPrice })}
                          >
                            {sendCoverPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            Confirm Cover{coverPrice > 0 ? ` · ${coverPrice}g` : ""}
                          </ActionButton>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
              {sendCoverError && (
                <p className="mt-1 text-[11px] text-destructive">{sendCoverError.message}</p>
              )}
            </div>
          )}

          {/* Genetic material collect */}
          {!readonly && (
            <div className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Genetic Material</span>
                <ActionButton variant="soft" disabled className="h-6 px-2 text-[11px]">View Storage</ActionButton>
              </div>
              <div className="mb-2 flex gap-0.5">
                {(["PERSONAL", "VET", "GROUP"] as StorageType[]).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStorageType(st)}
                    className={cn(
                      "flex-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors",
                      storageType === st
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {st.charAt(0) + st.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <ActionButton
                variant="soft"
                className="w-full justify-center"
                disabled={collectPending || isRestricted || (isFemale && !!preg)}
                onClick={() => collectMaterial({
                  animalId: animal.id,
                  materialType: isMale ? "SPERM" : "EGG",
                  storageType,
                })}
              >
                {collectPending
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Syringe className="size-3.5" />}
                {isMale ? "Collect Sperm" : "Collect Egg"}
              </ActionButton>
              {isFemale && !!preg && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">Unavailable during pregnancy</p>
              )}
              {collectError && (
                <p className="mt-1.5 text-[11px] text-destructive">{collectError.message}</p>
              )}
            </div>
          )}

          {/* Castrate */}
          {isMale && !readonly && (
            <>
              <ActionButton
                variant="soft"
                className="w-full justify-center text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmCastrate(true)}
              >
                <Scissors className="size-3.5" /> Castrate
              </ActionButton>
              {confirmCastrate && (
                <Dialog open onClose={() => setConfirmCastrate(false)} title="Castrate this horse?">
                  <div className="space-y-4 p-4">
                    <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-3 space-y-2">
                      <p className="text-sm font-bold text-destructive">This is permanent and cannot be undone.</p>
                      <ul className="space-y-1 text-[11px] text-destructive/90 list-disc list-inside">
                        <li>{animal.name} will permanently lose the ability to breed</li>
                        <li>Any active breeding listing will become inaccessible to new bookings</li>
                        <li>This horse will be recorded as a gelding for the remainder of its life</li>
                        <li>No refunds will be issued for any purchased breeding slots</li>
                      </ul>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-border pt-3">
                      <ActionButton variant="soft" onClick={() => setConfirmCastrate(false)} disabled={castratePending}>
                        Cancel
                      </ActionButton>
                      <ActionButton
                        variant="soft"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={castratePending}
                        onClick={() => castrate({ animalId: animal.id })}
                      >
                        {castratePending ? <Loader2 className="size-3.5 animate-spin" /> : <Scissors className="size-3.5" />}
                        Castrate {animal.name}
                      </ActionButton>
                    </div>
                  </div>
                </Dialog>
              )}
            </>
          )}
        </div>
      ) : (
        /* Storage — shown for covers tab or non-breedable animals (e.g. seniors who can be surrogates) */
        <div className="space-y-2">
          {canBreed && isFemale && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Incoming Covers
              </h4>
              {animal.coverOffersAsDam.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No pending offers</p>
              ) : (
                <div className="space-y-1.5">
                  {animal.coverOffersAsDam.map((offer) => (
                    <div
                      key={offer.id}
                      className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            to="/animal/$animalId"
                            params={{ animalId: offer.sire.id }}
                            className="text-[11px] font-semibold text-foreground hover:underline"
                          >
                            {offer.sire.name}
                          </Link>
                          <span className="ml-1.5 text-[11px] text-muted-foreground">· {offer.sire.breed.name}</span>
                          <p className="text-[10px] text-muted-foreground">from {offer.sire.playerAccount.username}</p>
                        </div>
                        {offer.price > 0 && (
                          <span className="shrink-0 text-[11px] font-semibold text-foreground">{offer.price}g</span>
                        )}
                      </div>
                      {!readonly && !preg && (
                        <div className="flex gap-1.5">
                          <ActionButton
                            variant="soft"
                            className="flex-1 justify-center"
                            disabled={actioningOfferId === offer.id}
                            onClick={() => navigate({ to: "/breeding/$offerId", params: { offerId: offer.id } })}
                          >
                            Accept
                          </ActionButton>
                          <ActionButton
                            variant="soft"
                            className="flex-1 justify-center text-destructive hover:bg-destructive/10"
                            disabled={actioningOfferId === offer.id}
                            onClick={() => { setActioningOfferId(offer.id); declineCover({ offerId: offer.id }) }}
                          >
                            {actioningOfferId === offer.id ? <Loader2 className="size-3.5 animate-spin" /> : null}
                            Decline
                          </ActionButton>
                        </div>
                      )}
                      {preg && (
                        <p className="text-[10px] text-muted-foreground">Cannot accept — already pregnant</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {isMale && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pending Covers
              </h4>
              {animal.coverOffersAsSire.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No pending cover offers</p>
              ) : (
                <div className="space-y-1.5">
                  {animal.coverOffersAsSire.map((offer) => (
                    <div
                      key={offer.id}
                      className="rounded-md border border-border/70 bg-secondary/30 px-2.5 py-2 space-y-1.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            to="/animal/$animalId"
                            params={{ animalId: offer.dam.id }}
                            className="text-[11px] font-semibold text-foreground hover:underline"
                          >
                            {offer.dam.name}
                          </Link>
                          <span className="ml-1.5 text-[11px] text-muted-foreground">· {offer.dam.breed.name}</span>
                          <p className="text-[10px] text-muted-foreground">to {offer.dam.playerAccount.username}</p>
                        </div>
                        {offer.price > 0 && (
                          <span className="shrink-0 text-[11px] font-semibold text-foreground">{offer.price}g</span>
                        )}
                      </div>
                      {!readonly && (
                        <ActionButton
                          variant="soft"
                          className="w-full justify-center text-destructive hover:bg-destructive/10"
                          disabled={actioningOfferId === offer.id}
                          onClick={() => { setActioningOfferId(offer.id); declineCover({ offerId: offer.id }) }}
                        >
                          {actioningOfferId === offer.id ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
                          Cancel
                        </ActionButton>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {isFemale && (
            <div>
              <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Genetic Storage
              </h4>
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-secondary/30 px-2.5 py-1.5">
                <Dna className="size-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">No stored material</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
