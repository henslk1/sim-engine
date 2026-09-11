import { trpcVanilla } from "@/lib/trpc"
import { queryClient } from "@/lib/query-client"

export async function grantGold(gameId: string): Promise<void> {
  await trpcVanilla.tutorial.grantStartingGold.mutate({ gameId })
  await queryClient.refetchQueries({ queryKey: [["player", "balances"]], type: "active" })
}
