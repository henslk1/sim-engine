import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"

export function stableSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep } = callbacks

  return [
    // ── [6] Stable nav — nav ───────────────────────────────────────────────────
    // Clicking navigates to /stable. ctrl.moveNext() fires synchronously so
    // localStorage is updated before beforeLoad runs on the destination page.
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
          ctrl.moveNext()
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => el.removeEventListener("click", fn)
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [7] Stable intro — floating ────────────────────────────────────────────
    {
      popover: {
        title: "Your Stable",
        description: "This is where you'll manage the horses you own.",
      },
    },

    // ── [8] Horse count — info ─────────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-horse-count"]',
      disableActiveInteraction: true,
      popover: {
        title: "Horse Count",
        description: "You can see how many living horses you currently own here.",
      },
    },

    // ── [9] Paddocks — info ────────────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-paddocks"]',
      disableActiveInteraction: true,
      popover: {
        title: "Paddocks",
        description: "Paddocks let you organize your herd as your stable grows.",
      },
    },

    // ── [10] Mare card — action ────────────────────────────────────────────────
    // Clicking navigates to the animal profile. ctrl.moveNext() fires synchronously;
    // completeStep fires before navigation so it isn't lost on page change.
    {
      element: '[data-tutorial="tutorial-mare-stable-card"]',
      waitForElement: 5000,
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
          ctrl.moveNext()
        }
        target.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => target.removeEventListener("click", fn)
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },
  ]
}
