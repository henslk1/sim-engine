import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { OwnerView } from "./-animal-profile/views/OwnerView"
import { BuriedView } from "./-animal-profile/views/BuriedView"
import { DeceasedPendingView } from "./-animal-profile/views/DeceasedPendingView"
import { ArchivedView } from "./-animal-profile/views/ArchivedView"

export const Route = createFileRoute("/_authenticated/animal/$animalId")({
  component: AnimalProfilePage,
})

function AnimalProfilePage() {
  const { animalId } = Route.useParams()
  const { data: animal, isLoading } = trpc.animalProfile.get.useQuery({ animalId })

  if (isLoading)
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  if (!animal) return <div className="p-8 text-sm">Animal not found</div>

  if (animal.status === "DECEASED") return <DeceasedPendingView animal={animal} animalId={animalId} />
  if (animal.status === "BURIED") return <BuriedView animal={animal} />
  if (animal.status === "ARCHIVED") return <ArchivedView animal={animal} animalId={animalId} />
  return <OwnerView animal={animal} animalId={animalId} />
}
