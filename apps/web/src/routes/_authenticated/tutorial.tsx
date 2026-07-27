import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/tutorial")({
  component: TutorialPage,
})

function TutorialPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">Tutorial coming soon.</p>
    </div>
  )
}
