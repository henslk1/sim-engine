import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { OwnerView } from "./-animal-profile/views/OwnerView"

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

  // viewMode derived from animal.status + auth will gate which view renders
  return <OwnerView animal={animal} animalId={animalId} />
}
