import { trpcVanilla } from "@/lib/trpc"
import { queryClient } from "@/lib/query-client"

export async function grantPremium(gameId: string): Promise<void> {
  await trpcVanilla.tutorial.grantStartingPremium.mutate({ gameId })
  await queryClient.refetchQueries({ queryKey: [["player", "balances"]], type: "active" })
}
