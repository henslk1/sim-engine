import type { TRPCLink } from "@trpc/client"
import { TRPCClientError } from "@trpc/client"
import { observable } from "@sim-engine/trpc/observable"
import type { AppRouter } from "@sim-engine/trpc"
import { getTutorialAccess } from "./access"

let pending = Promise.resolve()
let actionFailed = false
// Finish the clicked action before saving the next step. HTTP batching otherwise
// lets a step update race the action that caused it (including React onMutate).
export const tutorialMutationQueue: TRPCLink<AppRouter> = () => ({ op, next }) => {
  if (op.type !== "mutation" || !getTutorialAccess().restricted) return next(op)
  return observable(observer => {
    let cancelled = false
    let subscription: { unsubscribe: () => void } | undefined
    const previous = pending
    let finish!: () => void
    pending = new Promise<void>(resolve => { finish = resolve })
    void previous.then(() => {
      if (cancelled) { finish(); return }
      if (op.path === "tutorial.setDriverStep" && actionFailed) {
        actionFailed = false
        observer.error(new TRPCClientError("The previous tutorial action failed. Continue from the dashboard to retry."))
        finish()
        return
      }
      subscription = next(op).subscribe({
        next: value => { actionFailed = false; observer.next(value) },
        error: error => { actionFailed = op.path !== "tutorial.setDriverStep"; observer.error(error); finish() },
        complete: () => { observer.complete(); finish() },
      })
    })
    return () => { cancelled = true; subscription?.unsubscribe(); if (subscription) finish() }
  })
}
