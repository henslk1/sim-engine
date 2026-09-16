import type { TRPCLink } from "@trpc/client"
import { observable } from "@sim-engine/trpc/observable"
import type { AppRouter } from "@sim-engine/trpc"
import { getTutorialAccess } from "./access"

let pending = Promise.resolve()
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
      subscription = next(op).subscribe({
        next: value => observer.next(value),
        error: error => { observer.error(error); finish() },
        complete: () => { observer.complete(); finish() },
      })
    })
    return () => { cancelled = true; subscription?.unsubscribe(); if (subscription) finish() }
  })
}
