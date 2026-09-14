import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"
import { waitForElement } from "../utils/wait-for-element"

export function shopSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { grantGold, completeStep } = callbacks
  let profileBlockCleanup: (() => void) | undefined

  return [
    // ── [0] Shop nav — nav ─────────────────────────────────────────────────────
    {
      element: '[data-tutorial="shop-nav"]',
      popover: {
        title: "Start at the Shop",
        description: "Your foundation mare is waiting for you there. Let's get the first horse for your breeding program.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        const fn = () => {
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 700)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => el.removeEventListener("click", fn)
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [1] Shop intro — page-load ─────────────────────────────────────────────
    {
      popover: {
        title: "The Shop",
        description: "You'll return here often for horses, equipment, supplies, and other essentials for your stable.",
      },
      onHighlighted: async () => {
        await waitForElement('[data-tutorial="shop-content"]')
        ctrl.refresh()
      },
    },

    // ── [2] Gold balance — claim ───────────────────────────────────────────────
    {
      element: '[data-tutorial="gold-balance"]',
      popover: {
        title: "Starting Funds",
        description:
          "Gold is the everyday currency used for horses, equipment, veterinary care, and other expenses. Here's some to get your stable started.",
        showButtons: ["next"],
        onPopoverRender: (popover) => {
          popover.nextButton.textContent = "+ 300G"
          popover.nextButton.style.cssText += "; padding: 8px 20px; font-size: 14px; letter-spacing: 0.02em;"
        },
        onNextClick: () => {
          const btn = document.querySelector<HTMLButtonElement>("#driver-popover-content .driver-popover-next-btn")
          if (!btn || btn.disabled) return
          btn.disabled = true
          btn.textContent = "Adding…"
          grantGold(300)
            .catch((e) => console.error("[tutorial step 2] grantGold error:", e))
            .finally(() => setTimeout(() => ctrl.moveNext(), 800))
        },
      },
    },

    // ── [3] Animals tab — action ───────────────────────────────────────────────
    {
      element: '[data-tutorial="shop-animals-tab"]',
      popover: {
        title: "Animals",
        description: "Click the Animals tab to see the horses available in the game shop.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        const fn = () => {
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 400)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => el.removeEventListener("click", fn)
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [4] Mare card — info-auto ──────────────────────────────────────────────
    {
      element: '[data-tutorial="shop-animal-card"]',
      disableActiveInteraction: true,
      popover: {
        title: "Great — there she is!",
        description: "Your foundation mare is ready to join your stable.",
        showButtons: [],
      },
      onHighlighted: () => { setTimeout(() => ctrl.moveNext(), 2000) },
    },

    // ── [5] Buy button — action + block-profile ────────────────────────────────
    {
      element: '[data-tutorial="shop-animal-buy"]',
      popover: {
        title: "Bring Her Home",
        description: "Purchase your mare to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return

        const blockProfile = (e: MouseEvent) => {
          const link = (e.target as Element).closest?.("a") as HTMLAnchorElement | null
          if (link?.getAttribute("href")?.includes("/animal/")) {
            e.preventDefault()
            e.stopPropagation()
          }
        }
        document.addEventListener("click", blockProfile, true)
        profileBlockCleanup = () => document.removeEventListener("click", blockProfile, true)

        const buyFn = () => {
          el.removeEventListener("click", buyFn)
          completeStep("step_shop").catch(console.error)
          setTimeout(() => ctrl.moveNext(), 1500)
        }
        el.addEventListener("click", buyFn)
      },
      onDeselected: () => {
        profileBlockCleanup?.()
        profileBlockCleanup = undefined
      },
    },
  ]
}
