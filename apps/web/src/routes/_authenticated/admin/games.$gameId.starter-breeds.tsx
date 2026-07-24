import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/_authenticated/admin/games/$gameId/starter-breeds',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/_authenticated/admin/games/$gameId/starter-breeds"!</div>
}
