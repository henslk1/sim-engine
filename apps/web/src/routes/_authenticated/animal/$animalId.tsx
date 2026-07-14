import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { OwnerView } from "./-animal-profile/views/OwnerView"
import { BuriedView } from "./-animal-profile/views/BuriedView"
import { DeceasedPendingView } from "./-animal-profile/views/DeceasedPendingView"
import { ArchivedView } from "./-animal-profile/views/ArchivedView"
import { VisitorView } from "./-animal-profile/views/VisitorView"

export const Route = createFileRoute("/_authenticated/animal/$animalId")({
  component: AnimalProfilePage,
})

function AnimalProfilePage() {
  const { animalId } = Route.useParams()
  const { data: animal, isLoading } = trpc.animalProfile.get.useQuery({ animalId })
  const { data: me } = trpc.player.me.useQuery(
    { gameId: animal?.gameId ?? "" },
    { enabled: !!animal },
  )

  if (isLoading)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  if (!animal) return <div className="p-8 text-sm">Animal not found</div>
  const isOwner = !!me && me.id === animal.playerAccount.id

  if (animal.status === "EMBRYO_STORED") return <div className="p-8 text-sm text-muted-foreground">This animal is stored as an embryo.</div>
  if (animal.status === "DECEASED") return <DeceasedPendingView animal={animal} animalId={animalId} />
  if (animal.status === "BURIED") return <BuriedView animal={animal} />
  if (animal.status === "ARCHIVED") return <ArchivedView animal={animal} animalId={animalId} />
  // TODO: restore visitor routing once player accounts are set up
  // if (!isOwner) return <VisitorView animal={animal} animalId={animalId} />
  return <OwnerView animal={animal} animalId={animalId} />
}
