import type { DriveStep } from "driver.js"
import type { TutorialCtrl, TutorialCallbacks } from "../types"
import { saveTutorialVenueId, setTutorialAccess } from "../access"

let _pulseStyleEl: HTMLStyleElement | null = null
function injectPulseStyle() {
  if (_pulseStyleEl) return
  const el = document.createElement("style")
  el.textContent = `@keyframes tutorial-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--primary) 60%,transparent)}50%{box-shadow:0 0 0 6px transparent}}.tutorial-pulse{animation:tutorial-pulse 1.4s ease-in-out infinite}`
  document.head.appendChild(el)
  _pulseStyleEl = el
}
function removePulseStyle() {
  _pulseStyleEl?.remove()
  _pulseStyleEl = null
}

export function venueSteps(ctrl: TutorialCtrl, _callbacks: TutorialCallbacks): DriveStep[] {
  return [

    // ── [82] First venue card — climate & terrain ─────────────────────────
    {
      element: '[data-tutorial="venue-card-first"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Venues",
        description: "Venues are hosted in different regions. Here you can see the climate and terrain at a specific venue.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="venue-card-conditions"]')
          .forEach(el => el.classList.add("tutorial-pulse"))
      },
      onDeselected: () => {
        removePulseStyle()
        document.querySelectorAll('[data-tutorial="venue-card-conditions"]')
          .forEach(el => el.classList.remove("tutorial-pulse"))
      },
    },

    // ── [83] First venue card — discipline area ───────────────────────────
    {
      element: '[data-tutorial="venue-card-disciplines-first"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Hosted Disciplines",
        description: "Here you can see what disciplines this venue is currently hosting.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [84] Discipline filter ─────────────────────────────────────────────
    {
      element: '[data-tutorial="venue-discipline-filter"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Filtering by Discipline",
        description: "Let's see what venues are available for your mare's discipline.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = document.querySelector('[data-tutorial="venue-discipline-badge"]')?.textContent?.trim()
          if (name) popover.description.textContent = `Let's see what venues are currently hosting ${name}.`
        },
      },
      onHighlighted: () => {
        injectPulseStyle()
        document.querySelector('[data-tutorial="venue-discipline-badge"]')?.classList.add("tutorial-pulse")
      },
      onDeselected: () => {
        removePulseStyle()
        document.querySelector('[data-tutorial="venue-discipline-badge"]')?.classList.remove("tutorial-pulse")
      },
    },

    // ── [84] Unguided venue pick ───────────────────────────────────────────
    // The interaction guard keeps all other controls blocked after the prompt
    // is dismissed. The SVG overlay itself must be hidden to let card clicks land.
    {
      disableActiveInteraction: false,
      popover: {
        title: "Choose a Venue",
        description: "Pick a venue you'd like to visit. Keep your mare's terrain and climate suitability in mind.",
        showButtons: ["next"],
        nextBtnText: "Okay",
        onNextClick: () => {
          document.querySelector<HTMLElement>(".driver-popover")?.style.setProperty("display", "none")
          document.querySelector<SVGElement>(".driver-overlay")?.style.setProperty("display", "none")
          document.querySelectorAll<HTMLElement>('[data-tutorial="tutorial-venue-card"], [data-tutorial="venue-card-first"]').forEach(card => {
            card.style.setProperty("pointer-events", "auto", "important")
          })
          setTutorialAccess({ venueChoiceAcknowledged: true })
        },
      },
      onHighlighted: () => {
        setTutorialAccess({ venueChoiceAcknowledged: false })
        const handler = (event: MouseEvent) => {
          const card = event.target instanceof Element
            ? event.target.closest<HTMLAnchorElement>('[data-tutorial="tutorial-venue-card"], [data-tutorial="venue-card-first"]')
            : null
          if (!card) return
          const venueId = new URL(card.href).pathname.split("/")[2]
          if (venueId) saveTutorialVenueId(venueId)
          document.removeEventListener("click", handler, true)
          setTimeout(() => ctrl.moveNext(), 0)
        }
        document.addEventListener("click", handler, true)
        ;(document as any).__tutorialVenuePickCleanup = () => document.removeEventListener("click", handler, true)
      },
      onDeselected: () => {
        setTutorialAccess({ venueChoiceAcknowledged: false })
        document.querySelector<HTMLElement>(".driver-popover")?.style.removeProperty("display")
        document.querySelector<SVGElement>(".driver-overlay")?.style.removeProperty("display")
        document.querySelectorAll<HTMLElement>('[data-tutorial="tutorial-venue-card"], [data-tutorial="venue-card-first"]').forEach(card => {
          card.style.removeProperty("pointer-events")
        })
        ;(document as any).__tutorialVenuePickCleanup?.()
        delete (document as any).__tutorialVenuePickCleanup
      },
    },

    // ── [86] Venue detail — discipline section ────────────────────────────
    // The accordion may be collapsed. advanceOnClick triggers when the user
    // expands the section, advancing past this step.
    {
      element: '[data-tutorial="tutorial-discipline-section-btn"]',
      waitForElement: 8000,
      popover: {
        title: "Competition Disciplines",
        description: "This is where all open competitions for a discipline will be found. Expand your mare's discipline section.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        // The venue list can re-render this button after tutorial data loads.
        // Delegate the click so a replacement button still advances the tour.
        const handler = (event: MouseEvent) => {
          if (!(event.target instanceof Element) || !event.target.closest('[data-tutorial="tutorial-discipline-section-btn"]')) return
          document.removeEventListener("click", handler)
          setTimeout(() => ctrl.moveNext(), 0)
        }
        document.addEventListener("click", handler)
        ;(el as any).__tutorialDisciplineCleanup = () => document.removeEventListener("click", handler)
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialDisciplineCleanup?.()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [87] Venue detail — mare's tier ───────────────────────────────────
    {
      element: '[data-tutorial="tutorial-compete-tier"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Your Mare's Tier",
        description: "Your mare is eligible for competitions in this tier.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [88] Venue detail — competition block ─────────────────────────────
    {
      element: '[data-tutorial="tutorial-compete-section"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Competition Details",
        description: "You can see the competition details here.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [88] Venue detail — enter button ──────────────────────────────────
    // Wait for the successful mutation to mark the button entered; a failed
    // request leaves this step active so the player can retry.
    {
      element: '[data-tutorial="tutorial-compete-btn"]',
      waitForElement: 3000,
      disableActiveInteraction: false,
      popover: {
        title: "Enter the Competition",
        description: "Enter your horse now.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        let advanced = false
        const checkEntered = () => {
          if (advanced || !document.querySelector('[data-tutorial="tutorial-compete-btn"]')?.textContent?.includes("Entered")) return
          advanced = true
          observer.disconnect()
          ctrl.moveNext()
        }
        const observer = new MutationObserver(checkEntered)
        observer.observe(document.body, { childList: true, subtree: true, characterData: true })
        ;(el as any).__tutorialEnteredCleanup = () => observer.disconnect()
        checkEntered()
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialEnteredCleanup?.()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [89] Venue detail — all venues back link ──────────────────────────
    {
      element: '[data-tutorial="venue-back-link"]',
      waitForElement: 3000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Let's See the Results",
        description: "Great work! Head back to the venue list.",
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

    // ── [90] Venues page — back to animal ─────────────────────────────────
    {
      element: '[data-tutorial="venues-back-link"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Let's See the Results",
        description: "Head back to your mare to check her competition results.",
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

    // ── [91] Animal page — competition history tab ─────────────────────────
    {
      element: '[data-tutorial="competition-history-tab"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Competition History",
        description: "Click here to see your mare's competition history.",
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

    // ── [92] Animal page — first competition result ────────────────────────
    {
      element: '[data-tutorial="competition-result-first"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Competition Results",
        description: "You can see your mare's competition results here.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [93] Animal page — secondary discipline tab ────────────────────────
    {
      element: '[data-tutorial="discipline-tab-2"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Discipline Progress",
        description: "Your mare's competition progress is tracked here. Let's check her progress in her new discipline.",
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

    // ── [94] Animal page — secondary discipline progress bar ───────────────
    {
      element: '[data-tutorial="secondary-discipline-progress-bar"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Tier Progress",
        description: "She's already made progress in her new discipline, great work!",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [95] Full-page modal — unguided competition phase intro ───────────
    {
      popover: {
        title: "Keep Competing!",
        description: "Continue competing until she's advanced to the next tier, she's nearly ready for breeding. Don't forget to watch her energy level and complete her daily care.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },
  ]
}
