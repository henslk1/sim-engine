import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { UserCheck, UserX, X } from "lucide-react"

export const Route = createFileRoute("/_authenticated/friend-requests")({
  component: FriendRequestsPage,
})

function FriendRequestsPage() {
  const { data: gameData } = trpc.admin.game.get.useQuery()
  const gameId = gameData?.id
  const { data: me } = trpc.player.me.useQuery({ gameId: gameId! }, { enabled: !!gameId })
  const playerAccountId = me?.id

  const { data, refetch } = trpc.social.getFriendRequests.useQuery(
    { playerAccountId: playerAccountId!, gameId: gameId! },
    { enabled: !!playerAccountId && !!gameId }
  )

  const acceptMutation  = trpc.social.acceptFriendRequest.useMutation({ onSuccess: () => refetch() })
  const declineMutation = trpc.social.declineFriendRequest.useMutation({ onSuccess: () => refetch() })
  const cancelMutation  = trpc.social.cancelFriendRequest.useMutation({ onSuccess: () => refetch() })

  const incoming = data?.incoming ?? []
  const outgoing = data?.outgoing ?? []

  function Avatar({ username, avatar }: { username: string; avatar: string | null }) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {avatar
          ? <img src={avatar} alt="" className="h-full w-full object-cover" />
          : username[0].toUpperCase()
        }
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Friend Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage incoming and outgoing friend requests.</p>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-serif text-base font-semibold text-foreground">Incoming</h2>
          {incoming.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {incoming.length}
            </span>
          )}
          <div className="h-px flex-1 bg-border" />
        </div>
        {incoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incoming friend requests.</p>
        ) : (
          <div className="space-y-2">
            {incoming.map(req => (
              <div key={req.id} className="flex items-center gap-3 rounded border border-border bg-card px-4 py-3">
                <Avatar username={req.senderPlayer.username} avatar={req.senderPlayer.avatar} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/player/$username"
                    params={{ username: req.senderPlayer.username }}
                    className="text-sm font-medium text-foreground hover:text-primary"
                  >
                    {req.senderPlayer.username}
                  </Link>
                  <p className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => acceptMutation.mutate({ requestId: req.id })}
                    disabled={acceptMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-chart-2/40 bg-chart-2/10 px-3 py-1.5 text-xs font-medium text-chart-2 hover:bg-chart-2/20 disabled:opacity-50"
                  >
                    <UserCheck size={12} /> Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => declineMutation.mutate({ requestId: req.id })}
                    disabled={declineMutation.isPending}
                    className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <UserX size={12} /> Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-3">
          <h2 className="font-serif text-base font-semibold text-foreground">Outgoing</h2>
          <div className="h-px flex-1 bg-border" />
        </div>
        {outgoing.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending outgoing requests.</p>
        ) : (
          <div className="space-y-2">
            {outgoing.map(req => (
              <div key={req.id} className="flex items-center gap-3 rounded border border-border bg-card px-4 py-3">
                <Avatar username={req.recipientPlayer.username} avatar={req.recipientPlayer.avatar} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/player/$username"
                    params={{ username: req.recipientPlayer.username }}
                    className="text-sm font-medium text-foreground hover:text-primary"
                  >
                    {req.recipientPlayer.username}
                  </Link>
                  <p className="text-xs text-muted-foreground">{new Date(req.createdAt).toLocaleDateString()}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate({ requestId: req.id })}
                  disabled={cancelMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <X size={12} /> Cancel
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
