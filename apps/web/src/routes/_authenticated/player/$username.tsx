import { createFileRoute, Link } from "@tanstack/react-router"
import { useState } from "react"
import { trpc } from "@/lib/trpc"
import type { RouterOutputs } from "@/lib/trpc"
import { Panel } from "@/components/game/ui"
import { cn } from "@/lib/utils"
import { RichTextEditor } from "@/components/game/editor/RichTextEditor"
import { RichTextRenderer } from "@/components/game/editor/RichTextRenderer"

export const Route = createFileRoute("/_authenticated/player/$username")({
  component: PlayerProfilePage,
})

type ProfileData = RouterOutputs["player"]["getProfile"]
type RankingTab = "season" | "records"

function parseBioJson(raw: string | null | undefined): object | null {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

const LISTING_TYPE_LABELS: Record<string, string> = {
  ANIMAL: "Animal",
  ITEM: "Item",
  GENETIC_MATERIAL: "Genetic Material",
}

function canShow(
  key: string,
  settings: { fieldKey: string; isVisible: boolean }[],
  isSubscriber: boolean,
): boolean {
  if (!isSubscriber) return true
  return settings.find((s) => s.fieldKey === key)?.isVisible ?? true
}

function VisibilityToggle({
  fieldKey,
  isVisible,
  onToggle,
}: {
  fieldKey: string
  isVisible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  return (
    <button
      onClick={() => onToggle(fieldKey, !isVisible)}
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
        isVisible
          ? "bg-primary/15 text-primary hover:bg-primary/25"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
      )}
    >
      {isVisible ? "Visible" : "Hidden"}
    </button>
  )
}

function formatAge(cycles: number, cpy: number): string {
  const years = Math.floor(cycles / cpy)
  const months = cycles % cpy
  if (years === 0) return `${months}m`
  if (months === 0) return `${years}y`
  return `${years}y ${months}m`
}

function AnimalCard({ animal, cyclesPerYear }: {
  animal: ProfileData["animalsOwned"][number]
  cyclesPerYear: number
}) {
  return (
    <Link
      to="/animal/$animalId"
      params={{ animalId: animal.id }}
      className="group flex flex-col overflow-hidden rounded-md border border-border bg-secondary/20 transition-colors hover:border-primary/40"
    >
      <div className="aspect-square w-full overflow-hidden bg-secondary/30">
        {animal.image ? (
          <img
            src={animal.image}
            alt={animal.name}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-2xl opacity-20 select-none">🐎</span>
          </div>
        )}
      </div>
      <div className="p-1.5">
        <p className="truncate text-[11px] font-medium text-foreground">{animal.name}</p>
        <p className="truncate text-[10px] text-muted-foreground">{animal.breed.name}</p>
        <p className="text-[10px] text-muted-foreground/70">{formatAge(animal.ageInCycles, cyclesPerYear)}</p>
      </div>
    </Link>
  )
}

function StableView({ animals, subContainers, subContainerLabel, speciesNamePlural, cyclesPerYear }: {
  animals: ProfileData["animalsOwned"]
  subContainers: ProfileData["subContainers"]
  subContainerLabel: string
  speciesNamePlural: string
  cyclesPerYear: number
}) {
  const [activeTab, setActiveTab] = useState("unassigned")

  const byContainer = new Map<string | null, typeof animals>()
  for (const a of animals) {
    const key = a.subContainerId ?? null
    if (!byContainer.has(key)) byContainer.set(key, [])
    byContainer.get(key)!.push(a)
  }

  const tabs = [
    { id: "unassigned", label: "Unassigned", animals: byContainer.get(null) ?? [] },
    ...subContainers.map((sc) => ({
      id: sc.id,
      label: sc.name,
      animals: byContainer.get(sc.id) ?? [],
    })),
  ]

  const active = tabs.find((t) => t.id === activeTab) ?? tabs[0]
  const sp = speciesNamePlural.toLowerCase()
  const sc = subContainerLabel.toLowerCase()

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto border-b border-border -mx-3 px-3 pb-2 mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label} ({tab.animals.length})
          </button>
        ))}
      </div>
      {active.animals.length === 0 ? (
        <p className="py-2 text-xs italic text-muted-foreground">
          {active.id === "unassigned"
            ? `No unassigned ${sp}.`
            : `No ${sp} in this ${sc}.`}
        </p>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))" }}>
          {active.animals.map((a) => <AnimalCard key={a.id} animal={a} cyclesPerYear={cyclesPerYear} />)}
        </div>
      )}
    </div>
  )
}

function FriendsPanel({
  friendshipsAsPlayerOne,
  friendshipsAsPlayerTwo,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  friendshipsAsPlayerOne: ProfileData["friendshipsAsPlayerOne"]
  friendshipsAsPlayerTwo: ProfileData["friendshipsAsPlayerTwo"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  const friends = [
    ...friendshipsAsPlayerOne.map((f) => f.playerTwo),
    ...friendshipsAsPlayerTwo.map((f) => f.playerOne),
  ]

  return (
    <Panel
      title="Friends"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="FRIENDS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      {friends.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No friends yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {friends.map((f) => (
            <Link
              key={f.id}
              to="/player/$username"
              params={{ username: f.username }}
              className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-2 hover:border-primary/40 transition-colors"
            >
              <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary text-xs font-semibold text-muted-foreground">
                {f.avatar ? (
                  <img src={f.avatar} alt={f.username} className="h-full w-full object-cover" />
                ) : (
                  f.username[0].toUpperCase()
                )}
              </div>
              <span className="truncate text-xs font-medium text-foreground">{f.username}</span>
            </Link>
          ))}
        </div>
      )}
    </Panel>
  )
}

function GroupsPanel({
  memberships,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  memberships: ProfileData["groupMemberships"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  return (
    <Panel
      title="Groups"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="GROUPS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      {memberships.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No groups joined yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {memberships.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{m.group.name}</p>
              </div>
              <span
                className={cn(
                  "ml-2 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                  m.groupRole.isOwner
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground",
                )}
              >
                {m.groupRole.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function AchievementsPanel({
  achievements,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  achievements: ProfileData["achievements"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  if (!achievements.length) {
    return (
      <Panel title="Achievements" fit>
        <p className="text-xs text-muted-foreground">No achievements yet.</p>
      </Panel>
    )
  }
  return (
    <Panel
      title="Achievements"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="ACHIEVEMENTS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-1.5">
        {achievements.map((a) => (
          <div key={a.id} className="flex items-start gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-2">
            <span className="shrink-0 text-base select-none">🏆</span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{a.achievementDef.name}</p>
              {a.achievementDef.description && (
                <p className="text-[10px] text-muted-foreground leading-snug">{a.achievementDef.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function ClinicsPanel({
  clinics,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  clinics: ProfileData["hostedClinics"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  return (
    <Panel
      title="Clinics"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="CLINICS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      {clinics.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No clinics hosted yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {clinics.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
              <span className="text-xs font-medium text-foreground">{c.name}</span>
              {c.endsAt && (
                <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                  ends {new Date(c.endsAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function MarketplacePanel({
  breedingListings,
  marketplaceListings,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  breedingListings: ProfileData["breedingListings"]
  marketplaceListings: ProfileData["marketplaceListings"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  const hasAny = breedingListings.length > 0 || marketplaceListings.length > 0
  return (
    <Panel
      title="Listings"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="MARKETPLACE_LISTINGS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      {!hasAny ? (
        <p className="text-xs text-muted-foreground italic">No active listings.</p>
      ) : (
      <div className="flex flex-col gap-3">
        {breedingListings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Stud</p>
            <div className="flex flex-col gap-1.5">
              {breedingListings.map((l) => (
                <Link
                  key={l.id}
                  to="/stud-market"
                  search={{ listingId: l.id }}
                  className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2.5 py-2 hover:border-primary/40 transition-colors"
                >
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-secondary/40">
                    {l.animal.image ? (
                      <img src={l.animal.image} alt={l.animal.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-sm opacity-20 select-none">🐎</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">{l.animal.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{l.animal.breed.name}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
        {marketplaceListings.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Marketplace</p>
            <div className="flex flex-col gap-1.5">
              {marketplaceListings.map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2.5 py-2">
                  <span className="text-xs text-foreground">{LISTING_TYPE_LABELS[l.listingType] ?? l.listingType}</span>
                  <span className="text-xs font-medium text-foreground">
                    {l.price.toLocaleString()} {l.currencyDef.symbol}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      )}
    </Panel>
  )
}

function RankingsPanel({
  seasonRankings,
  recordEntries,
  isOwn,
  isSubscriber,
  isEditing,
  visible,
  onToggle,
}: {
  seasonRankings: ProfileData["seasonRankings"]
  recordEntries: ProfileData["recordEntries"]
  isOwn: boolean
  isSubscriber: boolean
  isEditing: boolean
  visible: boolean
  onToggle: (key: string, val: boolean) => void
}) {
  const [tab, setTab] = useState<RankingTab>("season")
  return (
    <Panel
      title="Rankings"
      fit
      action={
        isOwn && isSubscriber && isEditing ? (
          <VisibilityToggle fieldKey="LEADERBOARD_PLACINGS" isVisible={visible} onToggle={onToggle} />
        ) : undefined
      }
    >
      <div className="flex gap-1 border-b border-border -mx-3 px-3 pb-2 mb-3">
        {(["season", "records"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded px-2.5 py-1 text-xs font-medium transition-colors",
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "season" ? "Season" : "Records"}
          </button>
        ))}
      </div>
      {tab === "season" && (
        seasonRankings.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">No rankings yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {seasonRankings.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-md border border-border bg-secondary/20 px-2 py-1.5">
                <span className="shrink-0 text-sm font-bold text-primary">#{r.rank}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{r.category.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{r.season.name}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{r.score.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )
      )}
      {tab === "records" && (
        recordEntries.length === 0 ? (
          <p className="py-2 text-center text-xs text-muted-foreground">No records yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recordEntries.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border bg-secondary/20 px-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-foreground">{r.recordDef.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(r.setAt).toLocaleDateString(undefined, { year: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="ml-3 shrink-0 text-xs font-medium text-foreground">{r.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )
      )}
    </Panel>
  )
}

function PlayerProfilePage() {
  const { username } = Route.useParams()
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id ?? ""
  const { data: me } = trpc.player.me.useQuery({ gameId }, { enabled: !!gameId, staleTime: Infinity })
  const { data: profile, isLoading } = trpc.player.getProfile.useQuery({ username })

  const utils = trpc.useUtils()
  const updateProfile    = trpc.player.updateProfile.useMutation()
  const updateVisibility = trpc.player.updateVisibility.useMutation()

  const { data: relationship, refetch: refetchRelationship } = trpc.social.getRelationship.useQuery(
    { viewerPlayerAccountId: me?.id!, profilePlayerAccountId: profile?.id!, gameId },
    { enabled: !!me?.id && !!profile?.id && !!gameId && me?.id !== profile?.id }
  )
  const followMutation    = trpc.social.follow.useMutation({ onSuccess: () => refetchRelationship() })
  const unfollowMutation  = trpc.social.unfollow.useMutation({ onSuccess: () => refetchRelationship() })
  const sendFRMutation    = trpc.social.sendFriendRequest.useMutation({ onSuccess: () => refetchRelationship() })
  const cancelFRMutation  = trpc.social.cancelFriendRequest.useMutation({ onSuccess: () => refetchRelationship() })
  const acceptFRMutation  = trpc.social.acceptFriendRequest.useMutation({
    onSuccess: () => { refetchRelationship(); utils.player.getProfile.invalidate({ username }) },
  })
  const declineFRMutation = trpc.social.declineFriendRequest.useMutation({ onSuccess: () => refetchRelationship() })

  const [isEditing, setIsEditing] = useState(false)
  const [editBio, setEditBio] = useState<object | null>(null)
  const [visOverrides, setVisOverrides] = useState<Record<string, boolean>>({})
  const [animalsExpanded, setAnimalsExpanded] = useState(false)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">Player not found.</p>
      </div>
    )
  }

  const isOwn = !!me && me.id === profile.id
  const isSubscriber = profile.playerSubscriptions.length > 0

  const effectiveSettings = profile.profileVisibilitySettings.map((s) => ({
    ...s,
    isVisible: visOverrides[s.fieldKey] ?? s.isVisible,
  }))

  function getVisible(key: string) {
    return canShow(key, effectiveSettings, isSubscriber)
  }

  function handleVisToggle(key: string, val: boolean) {
    setVisOverrides((prev) => ({ ...prev, [key]: val }))
    updateVisibility.mutate({ playerAccountId: profile!.id, fieldKey: key, isVisible: val })
  }

  function handleStartEdit() {
    setEditBio(parseBioJson(profile!.profile?.bio))
    setIsEditing(true)
  }

  function handleSave() {
    updateProfile.mutate(
      { playerAccountId: profile!.id, bio: editBio ? JSON.stringify(editBio) : null },
      {
        onSuccess: () => {
          utils.player.getProfile.invalidate({ username })
          setIsEditing(false)
        },
      },
    )
  }

  function handleCancel() {
    setVisOverrides({})
    setIsEditing(false)
  }

  const showGroups = isOwn || getVisible("GROUPS")
  const showAchievements = isOwn || getVisible("ACHIEVEMENTS")
  const showMarketplace = isOwn || getVisible("MARKETPLACE_LISTINGS")
  const showClinics = isOwn || getVisible("CLINICS")
  const showRankings = isOwn || getVisible("LEADERBOARD_PLACINGS")
  const showFriends = isOwn || getVisible("FRIENDS")
  const friendCount = profile._count.friendshipsAsPlayerOne + profile._count.friendshipsAsPlayerTwo

  const speciesName = profile.animalsOwned[0]?.breed.species.name
  const speciesNamePlural = speciesName ? `${speciesName}s` : "Animals"

  const memberSince = new Date(profile.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
  })

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Banner */}
      <div className="relative h-36 w-full shrink-0 overflow-hidden bg-linear-to-br from-secondary to-muted">
        {profile.profile?.bannerPath && (
          <img
            src={profile.profile.bannerPath}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-card/90 via-card/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-3">
          <div className="mx-auto flex max-w-6xl items-end gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-secondary shadow-sm">
              {profile.avatar ? (
                <img src={profile.avatar} alt={profile.username} className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-muted-foreground">
                  {profile.username[0].toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h1 className="font-serif text-xl font-semibold leading-tight text-foreground">
                {profile.username}
              </h1>
              {profile.reputation && profile.reputation.totalRatings > 0 && (
                <p className="text-xs text-muted-foreground">
                  {profile.reputation.averageRating.toFixed(1)} ★ · {profile.reputation.totalRatings} ratings
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* InfoStrip */}
      <div className="shrink-0 border-b border-border bg-card/60 px-3 py-2 text-[11px]">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {profile.seniority && (
              <span className="rounded-full bg-secondary px-2.5 py-0.5 text-muted-foreground">
                {profile.seniority.activeDaysPlayed} active days
              </span>
            )}
            <span className="text-muted-foreground">Member since {memberSince}</span>
            <span className="cursor-not-allowed italic text-muted-foreground opacity-40">Forum Activity ↗</span>
            <span className="cursor-not-allowed italic text-muted-foreground opacity-40">Leaderboard ↗</span>
          </div>
          {isOwn ? (
            <div className="ml-auto flex shrink-0 gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={handleSave}
                    disabled={updateProfile.isPending}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {updateProfile.isPending ? "Saving…" : "Save"}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartEdit}
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  Edit Profile
                </button>
              )}
            </div>
          ) : me && relationship ? (
            <div className="ml-auto flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => relationship.isFollowing
                  ? unfollowMutation.mutate({ followerPlayerAccountId: me.id, followedPlayerAccountId: profile.id, gameId })
                  : followMutation.mutate({ followerPlayerAccountId: me.id, followedPlayerAccountId: profile.id, gameId })
                }
                disabled={followMutation.isPending || unfollowMutation.isPending}
                className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                {relationship.isFollowing ? "Unfollow" : "Follow"}
              </button>
              {relationship.friendStatus === "FRIENDS" && (
                <span className="rounded-md border border-chart-2/40 bg-chart-2/10 px-2.5 py-1 text-xs font-medium text-chart-2">
                  Friends
                </span>
              )}
              {relationship.friendStatus === "NONE" && (
                <button
                  type="button"
                  onClick={() => sendFRMutation.mutate({ senderPlayerId: me.id, recipientPlayerId: profile.id, gameId })}
                  disabled={sendFRMutation.isPending}
                  className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Add Friend
                </button>
              )}
              {relationship.friendStatus === "PENDING_SENT" && (
                <button
                  type="button"
                  onClick={() => relationship.friendRequestId && cancelFRMutation.mutate({ requestId: relationship.friendRequestId })}
                  disabled={cancelFRMutation.isPending}
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                >
                  Pending
                </button>
              )}
              {relationship.friendStatus === "PENDING_RECEIVED" && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => relationship.friendRequestId && acceptFRMutation.mutate({ requestId: relationship.friendRequestId })}
                    disabled={acceptFRMutation.isPending}
                    className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => relationship.friendRequestId && declineFRMutation.mutate({ requestId: relationship.friendRequestId })}
                    disabled={declineFRMutation.isPending}
                    className="rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    Decline
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* Main */}
      <main className="min-h-0 flex-1 overflow-auto p-3">
        <div className="mx-auto max-w-6xl flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-3 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)_minmax(0,1fr)]">

          {/* Left column */}
          <div className="flex flex-col gap-3">
            {showFriends && (
              <FriendsPanel
                friendshipsAsPlayerOne={profile.friendshipsAsPlayerOne}
                friendshipsAsPlayerTwo={profile.friendshipsAsPlayerTwo}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("FRIENDS")}
                onToggle={handleVisToggle}
              />
            )}
            {showGroups && (
              <GroupsPanel
                memberships={profile.groupMemberships}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("GROUPS")}
                onToggle={handleVisToggle}
              />
            )}
            {showAchievements && (
              <AchievementsPanel
                achievements={profile.achievements}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("ACHIEVEMENTS")}
                onToggle={handleVisToggle}
              />
            )}
            {showClinics && (
              <ClinicsPanel
                clinics={profile.hostedClinics}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("CLINICS")}
                onToggle={handleVisToggle}
              />
            )}
          </div>

          {/* Center column */}
          <div className="order-first min-[1100px]:order-0 flex flex-col gap-3">
            {/* Bio */}
            <div className="rounded-lg border border-border bg-card p-3">
              {isEditing ? (
                <RichTextEditor
                  defaultContent={editBio}
                  onChange={(json) => setEditBio(json)}
                  placeholder="Write something about yourself..."
                />
              ) : parseBioJson(profile.profile?.bio) ? (
                <RichTextRenderer content={parseBioJson(profile.profile?.bio)} className="text-sm" />
              ) : (
                <p className="text-sm italic text-muted-foreground/50">
                  {isOwn ? "No bio yet. Click Edit Profile to add one." : "No bio."}
                </p>
              )}
            </div>

          </div>

          {/* Right column */}
          <div className="flex flex-col gap-3">
            <Panel title="Stats" fit>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {[
                  { label: "Animals", value: profile._count.animalsOwned },
                  { label: "Bred", value: profile._count.animalsBred },
                  { label: "Groups", value: profile._count.groupMemberships },
                  { label: "Friends", value: friendCount },
                  { label: "Breeds Founded", value: profile._count.foundedBreeds },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-base font-semibold text-foreground">{value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </Panel>

            {showRankings && (
              <RankingsPanel
                seasonRankings={profile.seasonRankings}
                recordEntries={profile.recordEntries}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("LEADERBOARD_PLACINGS")}
                onToggle={handleVisToggle}
              />
            )}

            {showMarketplace && (
              <MarketplacePanel
                breedingListings={profile.breedingListings}
                marketplaceListings={profile.marketplaceListings}
                isOwn={isOwn}
                isSubscriber={isSubscriber}
                isEditing={isEditing}
                visible={getVisible("MARKETPLACE_LISTINGS")}
                onToggle={handleVisToggle}
              />
            )}

            {profile.foundedBreeds.length > 0 && (
              <Panel title="Founded Breeds" fit>
                <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))" }}>
                  {profile.foundedBreeds.map((b) => (
                    <Link
                      key={b.id}
                      to="/breeds/$breedId"
                      params={{ breedId: b.id }}
                      className="group flex flex-col items-center gap-1 overflow-hidden rounded-md border border-border bg-secondary/20 p-1.5 text-center transition-colors hover:border-primary/40"
                    >
                      <div className="aspect-square w-full overflow-hidden rounded bg-secondary/30">
                        {b.image ? (
                          <img src={b.image} alt={b.name} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-lg opacity-20 select-none">🐎</div>
                        )}
                      </div>
                      <p className="line-clamp-2 text-[10px] font-medium leading-tight text-foreground">{b.name}</p>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </div>

        </div>

        {/* Stable footer — spans full width below all columns */}
        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <button
            onClick={() => setAnimalsExpanded((v) => !v)}
            className="flex w-full items-center justify-between border-b border-border bg-secondary/40 px-3 py-2 transition-colors hover:bg-secondary/60"
          >
            <h3 className="text-sm font-semibold text-foreground">
              {gameData?.gameConfig?.containerLabel ?? "Stable"} ({profile._count.animalsOwned})
            </h3>
            <span className="text-xs text-muted-foreground">{animalsExpanded ? "▲" : "▼"}</span>
          </button>
          {animalsExpanded && (
            <div className="p-3">
              <StableView
                animals={profile.animalsOwned}
                subContainers={profile.subContainers}
                subContainerLabel={gameData?.gameConfig?.subContainerLabel ?? "paddock"}
                speciesNamePlural={speciesNamePlural}
                cyclesPerYear={gameData?.gameConfig?.cyclesPerYear ?? 12}
              />
            </div>
          )}
        </section>

        </div>
      </main>
    </div>
  )
}
