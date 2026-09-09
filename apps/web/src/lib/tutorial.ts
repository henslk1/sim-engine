import { driver } from "driver.js"
import type { DriveStep } from "driver.js"

// Set to a step index to halt the tour after that step. null = full flow. TODO: remove before launch
const DEV_STOP_AT_STEP: number | null = 2

export type TutorialCallbacks = {
  grantGold: () => Promise<void>
  completeStep: (stepKey: string) => Promise<void>
  devReset?: () => Promise<void> // TODO: remove before launch
}

// TODO: remove before launch
function showDevGate(onRestart: () => void, onAdvance: () => void) {
  document.getElementById("tutorial-dev-gate")?.remove()
  const gate = document.createElement("div")
  gate.id = "tutorial-dev-gate"
  Object.assign(gate.style, {
    position: "fixed", bottom: "72px", left: "50%", transform: "translateX(-50%)",
    background: "#1c1c1e", border: "1px solid #3a3a3c", borderRadius: "10px",
    padding: "10px 14px", zIndex: "999999", display: "flex", gap: "10px",
    alignItems: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
    fontFamily: "system-ui, sans-serif",
  })
  gate.innerHTML = `
    <span style="color:#888;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Dev stop</span>
    <button data-action="restart" style="background:#dc2626;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">↺ Restart</button>
    <button data-action="advance" style="background:#2563eb;color:#fff;border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;">→ Advance</button>
  `
  gate.querySelector<HTMLButtonElement>("[data-action='restart']")!.addEventListener("click", () => { gate.remove(); onRestart() })
  gate.querySelector<HTMLButtonElement>("[data-action='advance']")!.addEventListener("click", () => { gate.remove(); onAdvance() })
  document.body.appendChild(gate)
}

// Polls until element is in the DOM or timeout expires
function waitForElement(selector: string, timeoutMs = 8000): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector)
    if (existing) { resolve(existing); return }
    const start = Date.now()
    const interval = setInterval(() => {
      const el = document.querySelector(selector)
      if (el) { clearInterval(interval); resolve(el); return }
      if (Date.now() - start > timeoutMs) { clearInterval(interval); resolve(null) }
    }, 100)
  })
}

export function startTutorial(
  callbacks: TutorialCallbacks,
  startAtIndex: number,
  onComplete?: () => void,
) {
  const { grantGold, completeStep, devReset } = callbacks

  // Use a controller ref so steps can call moveNext/refresh without a circular reference
  const ctrl = {
    moveNext: () => {},
    isLastStep: () => false,
    destroy: () => {},
    refresh: () => {},
  }

  // Returns onHighlighted + onDeselected for a simple "click to advance" action step.
  // Hides all popover buttons and advances the tour after a click (with optional delay).
  function clickToAdvance(delayMs = 0): Pick<DriveStep, "onHighlighted" | "onDeselected"> {
    let cleanup: (() => void) | undefined
    return {
      onHighlighted: (el?: Element) => {
        if (!el) return
        const fn = () => {
          el.removeEventListener("click", fn)
          cleanup = undefined
          if (delayMs > 0) setTimeout(() => ctrl.moveNext(), delayMs)
          else ctrl.moveNext()
        }
        el.addEventListener("click", fn)
        cleanup = () => el.removeEventListener("click", fn)
      },
      onDeselected: () => { cleanup?.(); cleanup = undefined },
    }
  }

  let profileBlockCleanup: (() => void) | undefined

  const steps: DriveStep[] = [
    // ── [0] Shop nav — action ──────────────────────────────────────────────
    {
      element: '[data-tutorial="shop-nav"]',
      popover: {
        title: "Start at the Shop",
        description: "Your foundation mare is waiting for you there. Let's get the first horse for your breeding program.",
        showButtons: [],
      },
      ...clickToAdvance(700),
    },

    // ── [1] Shop intro — info (waits for page load after navigation) ───────
    {
      element: '[data-tutorial="shop-content"]',
      popover: {
        title: "The Shop",
        description:
          "You'll return here often for horses, equipment, supplies, and other essentials for your stable.",
      },
      onHighlighted: async () => {
        await waitForElement('[data-tutorial="shop-content"]')
        ctrl.refresh()
      },
    },

    // ── [2] Gold balance — info + grants 300G ──────────────────────────────
    {
      element: '[data-tutorial="gold-balance"]',
      popover: {
        title: "Starting Funds",
        description:
          "Gold is the everyday currency used for horses, equipment, veterinary care, and other expenses. Here's some to get your stable started.",
      },
      onHighlighted: () => {
        grantGold().catch(console.error)
      },
    },

    // ── [3] Animals tab — action + checkpoint ─────────────────────────────
    // Checkpoint: step_shop. Gold has been granted; user is ready to buy.
    // If user returns before purchasing, resume here.
    {
      element: '[data-tutorial="shop-animals-tab"]',
      popover: {
        title: "Animals",
        description: "Game-generated horses available for purchase can be found here.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        completeStep("step_shop").catch(console.error)
        if (!el) return
        let cleanup: (() => void) | undefined
        const fn = () => {
          el.removeEventListener("click", fn)
          cleanup = undefined
          setTimeout(() => ctrl.moveNext(), 400)
        }
        el.addEventListener("click", fn)
        cleanup = () => el.removeEventListener("click", fn)
        ;(el as any).__tutorialCleanup = cleanup
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [4] Mare card — info ───────────────────────────────────────────────
    {
      element: '[data-tutorial="shop-animal-card"]',
      popover: {
        title: "Great — there she is!",
        description: "Your foundation mare is ready to join your stable.",
      },
    },

    // ── [5] Buy button — action + profile link blocked ─────────────────────
    {
      element: '[data-tutorial="shop-animal-buy"]',
      popover: {
        title: "Bring Her Home",
        description: "Purchase your mare to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return

        // Prevent clicking the horse's profile link during this step
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
          setTimeout(() => ctrl.moveNext(), 1500)
        }
        el.addEventListener("click", buyFn)
      },
      onDeselected: () => {
        profileBlockCleanup?.()
        profileBlockCleanup = undefined
      },
    },

    // ── [6] Stable nav — action + checkpoint ──────────────────────────────
    // Checkpoint: step_purchased. Mare is in the stable.
    // If user returns before opening mare profile, resume here.
    {
      element: '[data-tutorial="stable-nav"]',
      popover: {
        title: "She's yours!",
        description: "Let's head to your Stable and meet her.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        completeStep("step_purchased").catch(console.error)
        if (!el) return
        let cleanup: (() => void) | undefined
        const fn = () => {
          el.removeEventListener("click", fn)
          cleanup = undefined
          setTimeout(() => ctrl.moveNext(), 800)
        }
        el.addEventListener("click", fn)
        cleanup = () => el.removeEventListener("click", fn)
        ;(el as any).__tutorialCleanup = cleanup
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [7] Stable intro — info (waits for page load after navigation) ─────
    {
      element: '[data-tutorial="stable-content"]',
      popover: {
        title: "Your Stable",
        description: "This is where you'll manage the horses you own.",
      },
      onHighlighted: async () => {
        await waitForElement('[data-tutorial="stable-content"]')
        ctrl.refresh()
      },
    },

    // ── [8] Horse count — info ────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-horse-count"]',
      popover: {
        title: "Horse Count",
        description: "You can see how many living horses you currently own here.",
      },
    },

    // ── [9] Paddocks — info ───────────────────────────────────────────────
    {
      element: '[data-tutorial="stable-paddocks"]',
      popover: {
        title: "Paddocks",
        description: "Paddocks let you organize your herd as your stable grows.",
      },
    },

    // ── [10] Mare card — action (opens profile) ────────────────────────────
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
          setTimeout(() => ctrl.moveNext(), 300)
        }
        target.addEventListener("click", fn)
      },
    },
  ]

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.55,
    smoothScroll: true,
    allowClose: false,
    onDestroyStarted: () => {
      if (ctrl.isLastStep()) {
        ctrl.destroy()
        onComplete?.()
      }
    },
    steps,
  })

  // Wire up ctrl after driver is created (avoids circular reference in steps)
  ctrl.moveNext = () => {
    const current = driverObj.getActiveIndex() ?? 0
    if (DEV_STOP_AT_STEP !== null && current >= DEV_STOP_AT_STEP) {
      showDevGate(
        () => {
          driverObj.destroy()
          const reset = devReset ? devReset() : Promise.resolve()
          reset.catch(console.error).finally(() => { window.location.href = "/dashboard?welcome=true" })
        },
        () => driverObj.moveNext(),
      )
      return
    }
    driverObj.moveNext()
  }
  ctrl.isLastStep = () => driverObj.isLastStep()
  ctrl.destroy = () => driverObj.destroy()
  ctrl.refresh = () => driverObj.refresh()

  driverObj.drive(startAtIndex)
}
