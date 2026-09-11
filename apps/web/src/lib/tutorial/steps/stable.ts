import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"
import { waitForElement } from "../utils/wait-for-element"

export function stableSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep } = callbacks

  return [
    // ── [6] Stable nav — nav ───────────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-nav"]',
      popover: {
        title: "She's yours!",
        description: "Let's head to your Stable and meet her.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        const fn = () => {
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 800)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => el.removeEventListener("click", fn)
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [7] Stable intro — page-load ───────────────────────────────────────────
    {
      popover: {
        title: "Your Stable",
        description: "This is where you'll manage the horses you own.",
      },
      onHighlighted: async () => {
        await waitForElement('[data-tutorial="stable-content"]')
        ctrl.refresh()
      },
    },

    // ── [8] Horse count — info ─────────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-horse-count"]',
      popover: {
        title: "Horse Count",
        description: "You can see how many living horses you currently own here.",
      },
    },

    // ── [9] Paddocks — info ────────────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-paddocks"]',
      popover: {
        title: "Paddocks",
        description: "Paddocks let you organize your herd as your stable grows.",
      },
    },

    // ── [10] Mare card — action ────────────────────────────────────────────────
    {
      element: '[data-tutorial="tutorial-mare-stable-card"]',
      popover: {
        title: "There she is!",
        description: "Your mare is ready to meet you. Open her profile to get started.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        const link = el.querySelector("a") as HTMLElement | null
        const target = link ?? (el as HTMLElement)
        const fn = () => {
          target.removeEventListener("click", fn)
          completeStep("step_purchased").catch(console.error)
          setTimeout(() => ctrl.moveNext(), 300)
        }
        target.addEventListener("click", fn)
      },
    },
  ]
}
