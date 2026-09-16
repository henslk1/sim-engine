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

export function competitionSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep, grantGold } = callbacks

  return [
    // ── [57] Health Requirements — info ──────────────────────────────────────
    {
      element: '[data-tutorial="competition-cert-requirements"]',
      waitForElement: 5000,
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
    // buttons. Clicking either one fires ctrl.moveNext() synchronously so
    // localStorage is updated before beforeLoad runs on /vet.
    {
      element: '[data-tutorial="health-certificates"]',
      waitForElement: 5000,
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
    // gold-balance is always in the header so the spotlight renders immediately
    // on the current page and stays positioned through navigation to /vet.
    {
      element: '[data-tutorial="gold-balance"]',
      disableActiveInteraction: true,
      popover: {
        title: "Preparing to Compete",
        description: "Getting a horse ready to compete comes with a few expenses. Here's 100 G to help with her remaining preparations.",
        showButtons: ["next"],
        onPopoverRender: (popover) => {
          popover.nextButton.textContent = "+ 100G"
          popover.nextButton.style.cssText += "; padding: 8px 20px; font-size: 14px; letter-spacing: 0.02em;"
        },
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
      waitForElement: 5000,
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
    // Pulses the back-to-profile link. On click, polls for primary-discipline-section
    // before calling ctrl.moveNext() so Driver.js doesn't hold this step open while
    // waiting for the next step's element to appear after navigation.
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
          delete (el as any).__tutorialCleanup
          removePulseStyle()

          const advance = () => { ctrl.moveNext() }
          let timer: ReturnType<typeof setInterval> | null = setInterval(() => {
            if (document.querySelector('[data-tutorial="primary-discipline-section"]')) {
              clearInterval(timer!); timer = null
              clearTimeout(guard)
              advance()
            }
          }, 100)
          const guard = setTimeout(() => {
            if (timer) { clearInterval(timer); timer = null }
            advance()
          }, 10000)
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
    // waitForElement waits silently for primary-discipline-section to render
    // after the player navigates back from /vet to the animal profile.
    {
      element: '[data-tutorial="primary-discipline-section"]',
      waitForElement: 2000,
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
    },

    // ── [63] Breeding Grade — info ────────────────────────────────────────────
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
    // advanceOnClick advances immediately when the button is clicked. The next
    // step uses waitForElement to wait for the inline form to render.
    {
      element: '[data-tutorial="add-second-discipline"]',
      advanceOnClick: true,
      popover: {
        title: "A Second Discipline",
        description: "Let's choose a second discipline and continue developing her competitive record.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [65] Choose Discipline — action ───────────────────────────────────────
    // waitForElement waits for the inline select form to render after the button
    // click. Pulses select and Confirm; disables Cancel. MutationObserver
    // advances automatically when the disc2 tab button appears.
    {
      element: '[data-tutorial="add-discipline-form"]',
      waitForElement: 5000,
      popover: {
        title: "A Second Discipline",
        description: "Let's choose a second discipline and continue developing her competitive record.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.querySelector<HTMLElement>('[data-tutorial="discipline-select"]')?.classList.add("tutorial-pulse")
        el.querySelector<HTMLElement>('[data-tutorial="discipline-confirm"]')?.classList.add("tutorial-pulse")
        const cancelEl = el.querySelector<HTMLButtonElement>('[data-tutorial="discipline-cancel"]')
        if (cancelEl) cancelEl.disabled = true

        let advanced = false
        const obs = new MutationObserver(() => {
          if (advanced) return
          if (document.querySelector('[data-tutorial="discipline-tab-2"]')) {
            advanced = true
            obs.disconnect()
            if (cancelEl) cancelEl.disabled = false
            removePulseStyle()
            ctrl.moveNext()
          }
        })
        obs.observe(document.body, { childList: true, subtree: true })
        ;(el as any).__discObs = obs
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        const obs = (el as any)?.__discObs as MutationObserver | undefined
        if (obs) { obs.disconnect(); delete (el as any).__discObs }
        el?.querySelector('[data-tutorial="discipline-select"]')?.classList.remove("tutorial-pulse")
        el?.querySelector('[data-tutorial="discipline-confirm"]')?.classList.remove("tutorial-pulse")
        const cancelEl = el?.querySelector<HTMLButtonElement>('[data-tutorial="discipline-cancel"]')
        if (cancelEl) cancelEl.disabled = false
      },
    },

    // ── [66] Open Disc2 Tab — action ──────────────────────────────────────────
    // waitForElement waits for the disc2 tab to appear. advanceOnClick advances
    // immediately when the tab is clicked; the next step waits for the content.
    {
      element: '[data-tutorial="discipline-tab-2"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "A Second Discipline",
        description: "Open her new discipline tab to review her competition setup.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = document.querySelector('[data-tutorial="discipline-tab-2"]')?.textContent?.trim()
          if (name) popover.description.textContent = `Open the ${name} tab to review her new discipline.`
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [67] Secondary Discipline — info (conditional) ────────────────────────
    // waitForElement waits for the secondary tab content to render after the
    // tab click. onNextClick checks for missing equipment and skips if unneeded.
    {
      element: '[data-tutorial="secondary-discipline-section"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "A Second Discipline",
        description: "Great choice! She's nearly ready to show in her new discipline.",
        showButtons: ["next"],
        onNextClick: () => {
          const needsEquipment = !!document.querySelector('[data-tutorial="secondary-missing-equipment"]')
          if (needsEquipment) {
            ctrl.moveNext()
          } else {
            ctrl.moveTo(79)
          }
        },
      },
    },

    // ── [68] Missing Equipment — info ─────────────────────────────────────────
    {
      element: '[data-tutorial="secondary-equipment-section"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Required Equipment",
        description: "All that's left is to purchase and equip the required tack.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [69] Head to Shop — action ────────────────────────────────────────────
    // Pulses town nav. Click handler calls ctrl.moveNext() immediately so
    // getTutorialAllowed(69) includes /town before beforeLoad fires there.
    {
      element: '[data-tutorial="town-nav"]',
      popover: {
        title: "Head to the Shop",
        description: "Let's visit the shop to purchase her new tack.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
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

    // ── [70] Town — action ────────────────────────────────────────────────────
    // waitForElement waits for the town page to render. advanceOnClick on the
    // Shop card advances before navigation so beforeLoad on /shop sees step 70.
    {
      element: '[data-tutorial="town-shop-card"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "Head to the Shop",
        description: "Head to the shop to pick up the required tack.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [71] Shop — action ────────────────────────────────────────────────────
    // waitForElement waits for the tutorial equipment item to appear (filtered
    // shop). advanceOnClick on the card advances when the buy button is clicked
    // (click bubbles up from button → article), while the normal onBuy fires too.
    {
      element: '[data-tutorial="tutorial-shop-item"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "Required Tack",
        description: "This is the tack she needs for her second discipline. Go ahead and purchase it.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [72] Back to Stable — action ──────────────────────────────────────────
    // Pulses stable nav. Click handler calls ctrl.moveNext() immediately; stable
    // nav persists in the header so advancing before navigation avoids the overlay
    // staying on the nav link while transitioning.
    {
      element: '[data-tutorial="stable-nav"]',
      popover: {
        title: "Back to the Stable",
        description: "Now let's head back to the stable.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
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

    // ── [73] Mare Stable Card — action ────────────────────────────────────────
    // waitForElement waits for the stable page to render the mare card.
    // advanceOnClick fires before navigation to /animal.
    {
      element: '[data-tutorial="tutorial-mare-stable-card"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "Back to Your Mare",
        description: "Click on her to return to her profile.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [74] Equip Action — action ────────────────────────────────────────────
    // waitForElement waits for the animal profile to render after navigation.
    // advanceOnClick fires when the equip button is clicked (which also opens
    // the equip modal via its normal onClick handler).
    {
      element: '[data-tutorial="equip-action"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "Equip Items",
        description: "Here is where you can equip and unequip items. Let's take a look.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [75] Tutorial Equip Item — action ─────────────────────────────────────
    // waitForElement waits for the equip modal to open and render the item.
    // advanceOnClick fires when the card (or Equip button inside it) is clicked;
    // the normal equip mutation fires in parallel via the button's onClick.
    {
      element: '[data-tutorial="tutorial-equip-item"]',
      waitForElement: 5000,
      advanceOnClick: true,
      popover: {
        title: "New Tack",
        description: "There it is. Go ahead and equip it.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [76] Equipped Panel — info ────────────────────────────────────────────
    // waitForElement waits briefly for the equipped list to re-render after equip.
    // onNextClick programmatically closes the modal so step [77] can spotlight
    // the discipline tab, which is otherwise hidden behind the modal overlay.
    {
      element: '[data-tutorial="equipped-list"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Equipped",
        description: "Her tack is now equipped and ready.",
        showButtons: ["next"],
        onNextClick: () => {
          document.querySelector<HTMLButtonElement>('[data-tutorial="equip-modal-close"]')?.click()
          ctrl.moveNext()
        },
      },
    },

    // ── [77] Discipline Tab 2 — action ───────────────────────────────────────
    // waitForElement waits for the modal to close and the competition panel to
    // be interactable. advanceOnClick fires on tab click.
    {
      element: '[data-tutorial="discipline-tab-2"]',
      waitForElement: 3000,
      advanceOnClick: true,
      popover: {
        title: "Secondary Discipline",
        description: "Switch to her secondary discipline tab.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [78] Secondary Discipline — info ─────────────────────────────────────
    {
      element: '[data-tutorial="secondary-discipline-section"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Ready to Compete",
        description: "She's ready to compete in her second discipline.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [79] View Venues — info ───────────────────────────────────────────────
    // Pulses the View Venues button on the secondary discipline tab. Stays on
    // /animal so the devPauseStep (global 79) fires on the correct page.
    {
      element: '[data-tutorial="view-venues-btn"]',
      disableActiveInteraction: true,
      popover: {
        title: "Ready to Compete!",
        description: "She's ready for her debut. Head to the venues to enter her first competition.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },
  ]
}
