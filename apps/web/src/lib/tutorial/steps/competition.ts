import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"
import { waitForElement } from "../utils/wait-for-element"

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

export function competitionSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep, grantGold } = callbacks

  return [
    // ── [57] Health Requirements — info ──────────────────────────────────────
    // Spotlights the failed certs in the Competition panel. Teaches the player
    // that competition blockers are shown here and gives the cert requirement
    // an in-world reason.
    {
      element: '[data-tutorial="competition-cert-requirements"]',
      disableActiveInteraction: true,
      popover: {
        title: "Health Requirements",
        description: "She's overdue for her health certifications. Keeping them current helps ensure horses are healthy before traveling off property.",
        onNextClick: () => {
          ctrl.moveNext()
        },
      },
    },

    // ── [58] Book With the Vet — action ───────────────────────────────────────
    // Spotlights the cert area in the Health panel. Pulses both Book Testing
    // buttons. Clicking either one advances the tutorial and lets the Link
    // navigate to /vet naturally.
    {
      element: '[data-tutorial="health-certificates"]',
      popover: {
        title: "Book With the Vet",
        description: "She'll need to visit the vet to renew her certificates. Use Book Testing to schedule the appointment.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        const bookBtns = Array.from(document.querySelectorAll<HTMLElement>('[data-tutorial="book-cert-testing"]'))
        bookBtns.forEach(btn => btn.classList.add("tutorial-pulse"))

        const fn = () => {
          bookBtns.forEach(btn => {
            btn.classList.remove("tutorial-pulse")
            btn.removeEventListener("click", fn)
          })
          removePulseStyle()
          ctrl.moveNext()
        }
        bookBtns.forEach(btn => btn.addEventListener("click", fn))

        ;(el as any).__tutorialCleanup = () => {
          bookBtns.forEach(btn => {
            btn.classList.remove("tutorial-pulse")
            btn.removeEventListener("click", fn)
          })
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [59] Preparing to Compete — page-load ────────────────────────────────
    // Fires when the player arrives at /vet. Grants +100G and explains that
    // getting competition-ready comes with some expenses.
    {
      popover: {
        title: "Preparing to Compete",
        description: "Getting a horse ready to compete comes with a few expenses. Here's 100 G to help with her remaining preparations.",
        onNextClick: () => {
          const btn = document.querySelector<HTMLButtonElement>("#driver-popover-content .driver-popover-next-btn")
          if (!btn || btn.disabled) return
          btn.disabled = true
          btn.textContent = "Adding…"
          grantGold(100)
            .catch((e) => console.error("[tutorial step 59] grantGold error:", e))
            .finally(() => setTimeout(() => ctrl.moveNext(), 800))
        },
      },
    },

    // ── [60] Renew Her Certificates — action ─────────────────────────────────
    // Spotlights the cert rows in the vet's CertificatesPanel. Pulses all Issue
    // buttons. After each cert is issued (button flips to "Renew"), removes that
    // pulse. Advances automatically when all buttons read "Renew".
    {
      element: '[data-tutorial="vet-health-certs"]',
      popover: {
        title: "Renew Her Certificates",
        description: "The vet can issue both of her required certificates during this visit. Renew her Coggins and Vaccination certificates to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        let advanced = false

        function updatePulse() {
          if (advanced) return
          const btns = Array.from(document.querySelectorAll<HTMLElement>('[data-tutorial="cert-issue-btn"]'))
          if (btns.length === 0) return

          let allDone = true
          btns.forEach(btn => {
            const text = btn.textContent?.trim()
            if (text === "Renew") {
              btn.classList.remove("tutorial-pulse")
            } else {
              btn.classList.add("tutorial-pulse")
              allDone = false
            }
          })

          if (allDone) {
            advanced = true
            completeStep("step_health_certs").catch(console.error)
            setTimeout(() => ctrl.moveNext(), 800)
          }
        }

        const obs = new MutationObserver(() => requestAnimationFrame(() => { updatePulse(); ctrl.refresh() }))
        obs.observe(el, { childList: true, subtree: true, characterData: true })
        ;(el as any).__certObs = obs

        updatePulse()
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        const obs = (el as any)?.__certObs as MutationObserver | undefined
        if (obs) { obs.disconnect(); delete (el as any).__certObs }
        document.querySelectorAll('[data-tutorial="cert-issue-btn"]').forEach(btn => btn.classList.remove("tutorial-pulse"))
      },
    },

    // ── [61] Ready to Continue — action ──────────────────────────────────────
    // Pulses the back-to-profile link. Clicking it advances the tutorial and
    // lets the Link navigate to the animal profile naturally.
    {
      element: '[data-tutorial="vet-back-link"]',
      popover: {
        title: "Ready to Continue",
        description: "She's cleared for travel and competition. Return to her profile when you're ready to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")

        const fn = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
          removePulseStyle()
          ctrl.moveNext()
        }
        el.addEventListener("click", fn)

        ;(el as any).__tutorialCleanup = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [62] Primary Discipline — info ────────────────────────────────────────
    // Spotlights the single-discipline view in the Competition panel after the
    // player returns from /vet. Dynamically inserts the discipline name.
    {
      element: '[data-tutorial="primary-discipline-section"]',
      disableActiveInteraction: true,
      popover: {
        title: "Primary Discipline",
        description: "This section tracks her progress in each discipline, including her current tier, weekly points, and progress toward advancement.",
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const discName = document.querySelector('[data-tutorial="primary-discipline-name"]')?.textContent?.trim()
          if (discName) {
            popover.description.textContent = `This section tracks her progress in each discipline, including her current tier, weekly points, and progress toward advancement. She's reached the highest tier in ${discName}.`
          }
        },
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: async (el?: Element) => {
        if (!el) {
          await waitForElement('[data-tutorial="primary-discipline-section"]')
          ctrl.refresh()
        }
      },
    },

    // ── [63] Breeding Grade — info ────────────────────────────────────────────
    // Spotlights the Breeding Grade chip in the InfoStrip. Notes it has improved
    // but there's still room to grow.
    {
      element: '[data-tutorial="breeding-grade"]',
      disableActiveInteraction: true,
      popover: {
        title: "Breeding Grade",
        description: "Her Breeding Grade has improved since we first checked it, but there's still room to grow. Finishing one discipline is only part of proving her competitive ability.",
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [64] A Second Discipline — action ─────────────────────────────────────
    // Spotlights and pulses the "+ Add Second Discipline" button. Clicking it
    // opens the discipline-selection form and advances the tutorial.
    {
      element: '[data-tutorial="add-second-discipline"]',
      popover: {
        title: "A Second Discipline",
        description: "Let's choose a second discipline and continue developing her competitive record.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")

        const fn = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
          removePulseStyle()
          ctrl.moveNext()
        }
        el.addEventListener("click", fn)

        ;(el as any).__tutorialCleanup = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },
  ]
}
