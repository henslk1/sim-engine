import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/")({
  component: () => <div className="p-8 text-foreground">Sim Engine</div>,
})
