import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"

const PULSE_STYLE_ID = "tutorial-pulse-style"

function injectPulseStyle() {
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = PULSE_STYLE_ID
  style.textContent = `
    @keyframes tutorial-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(99, 179, 237, 0.7); }
      70%  { box-shadow: 0 0 0 8px rgba(99, 179, 237, 0); }
      100% { box-shadow: 0 0 0 0 rgba(99, 179, 237, 0); }
    }
    .tutorial-pulse {
      animation: tutorial-pulse 1.4s ease-in-out infinite;
      outline: 2px solid rgba(99, 179, 237, 0.8);
      outline-offset: 2px;
    }
  `
  document.head.appendChild(style)
}

function removePulseStyle() {
  document.getElementById(PULSE_STYLE_ID)?.remove()
}

export function shopSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { grantGold, completeStep } = callbacks
  let profileBlockCleanup: (() => void) | undefined

  return [
    // ── [0] Shop nav — nav ─────────────────────────────────────────────────────
    // Spotlights the shop nav link. Clicking it navigates to /shop; ctrl.moveNext()
    // fires synchronously so localStorage is updated before beforeLoad runs.
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

    // ── [1] Shop intro — page-load ─────────────────────────────────────────────
    // waitForElement waits silently until shop-content renders on /shop.
    {
      element: '[data-tutorial="shop-content"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "The Shop",
        description: "You'll return here often for horses, equipment, supplies, and other essentials for your stable.",
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
    // advanceOnClick advances immediately when the tab is clicked. The next step
    // uses waitForElement to wait for the card to appear.
    {
      element: '[data-tutorial="shop-animals-tab"]',
      advanceOnClick: true,
      popover: {
        title: "Animals",
        description: "Click the Animals tab to see the horses available in the game shop.",
        showButtons: [],
      },
    },

    // ── [4] Mare card + buy — action + block-profile ──────────────────────────
    {
      element: '[data-tutorial="shop-animal-card"]',
      waitForElement: 5000,
      popover: {
        title: "There She Is",
        description: "Your foundation mare is ready to join your stable. Purchase her to continue.",
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

        injectPulseStyle()
        const buyEl = document.querySelector<HTMLButtonElement>('[data-tutorial="shop-animal-buy"]')
        if (buyEl) buyEl.classList.add("tutorial-pulse")

        let obs: MutationObserver | null = null

        const advance = () => {
          obs?.disconnect()
          obs = null
          completeStep("step_shop").catch(console.error)
          ctrl.moveNext()
        }

        const buyFn = () => {
          buyEl?.removeEventListener("click", buyFn)
          buyEl?.classList.remove("tutorial-pulse")

          let seenDisabled = false
          obs = new MutationObserver(() => {
            if (!buyEl || !document.contains(buyEl)) { advance(); return }
            if (buyEl.disabled) { seenDisabled = true; return }
            if (seenDisabled) advance()
          })
          obs.observe(document.body, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ["disabled"],
          })
        }
        buyEl?.addEventListener("click", buyFn)

        ;(el as any).__tutorialCleanup = () => {
          obs?.disconnect()
          obs = null
          buyEl?.classList.remove("tutorial-pulse")
          buyEl?.removeEventListener("click", buyFn)
        }
      },
      onDeselected: (el?: Element) => {
        profileBlockCleanup?.()
        profileBlockCleanup = undefined
        removePulseStyle()
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },
  ]
}
