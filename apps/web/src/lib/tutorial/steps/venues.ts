import type { DriveStep } from "driver.js"
import type { TutorialCtrl, TutorialCallbacks } from "../types"
import { prepareTutorialControl, saveTutorialListingId, saveTutorialVenueId, saveTutorialStallionId, setTutorialAccess } from "../access"

// Captured when tutorial:tierAdvanced fires during the unguided phase.
// Used by step 97 to personalise the popover text.
let capturedDisciplineName = ""

// Captured from the diagnosed condition row after the vet exam.
// Used by steps 106 and 108 to personalise the popover text.
let capturedConditionName = ""

// Captured from the active treatment block (step 109).
// Used by OTC purchase steps to identify the required item and duration.
let capturedTreatmentItem = ""
let capturedTreatmentDuration = 2
let treatmentDetailPhase = 0

function conditionName() {
  const visible = document.querySelector('[data-tutorial="health-diagnosed-condition"]')?.getAttribute("data-condition-name")
  return visible || capturedConditionName
}

function restoreTreatmentDetails() {
  try {
    const stored = JSON.parse(sessionStorage.getItem("tutorial:treatment") ?? "null")
    if (typeof stored?.item === "string") capturedTreatmentItem = stored.item
    if (Number.isInteger(stored?.duration) && stored.duration > 0) capturedTreatmentDuration = stored.duration
  } catch { /* The current treatment panel remains the source of truth. */ }
}

let _otcPurchaseCount = 0

function waitForDailyCare(ctrl: TutorialCtrl) {
  const selector = '[data-tutorial="daily-care-perform"],[data-tutorial="care-groom"],[data-tutorial="ltc-perform"]'
  injectPulseStyle()
  let finished = false
  const update = () => {
    document.querySelectorAll(selector).forEach(el => el.classList.add("tutorial-pulse"))
    if (!finished && document.querySelector('[data-tutorial="daily-care-counter"]')?.textContent?.trim() === "Completed") {
      finished = true
      observer.disconnect()
      ctrl.moveNext()
    }
  }
  const observer = new MutationObserver(update)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  update()
  return () => {
    observer.disconnect()
    document.querySelectorAll(selector).forEach(el => el.classList.remove("tutorial-pulse"))
    removePulseStyle()
  }
}

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

// The active-treatment block arrives on the refetch that startTreatment triggers
// and re-renders again as the invalidation cascade settles, which throws away a
// class set once on the node. Reapply on an interval so the highlighted detail
// keeps pulsing, and drive both details through here so only one is ever lit.
const TREATMENT_DETAILS = '[data-tutorial="treatment-required-item"],[data-tutorial="treatment-duration"]'
let _treatmentPulseCleanup: (() => void) | null = null
function pulseTreatmentDetail(selector: string) {
  clearTreatmentPulse()
  const apply = () => {
    document.querySelectorAll(TREATMENT_DETAILS).forEach(el => {
      el.classList.toggle("tutorial-pulse", el.matches(selector))
    })
  }
  apply()
  const timer = setInterval(apply, 300)
  _treatmentPulseCleanup = () => {
    clearInterval(timer)
    document.querySelectorAll(TREATMENT_DETAILS).forEach(el => el.classList.remove("tutorial-pulse"))
  }
}
function clearTreatmentPulse() {
  _treatmentPulseCleanup?.()
  _treatmentPulseCleanup = null
}

export function venueSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
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
      // Resuming mid-flow (reload, or right after entering) can land here with
      // the discipline section collapsed again — its open/closed state isn't
      // persisted. Expand it first, same as step [86], instead of failing to
      // find a button that's simply hidden.
      element: () => {
        const btn = document.querySelector<HTMLElement>('[data-tutorial="tutorial-compete-btn"]')
        if (btn) return btn
        const sectionBtn = document.querySelector<HTMLElement>('[data-tutorial="tutorial-discipline-section-btn"]')
        if (sectionBtn?.dataset.expanded === "false") sectionBtn.click()
        return document.querySelector<HTMLElement>('[data-tutorial="tutorial-compete-btn"]') ?? undefined
      },
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

    // ── [96] Unguided competing phase ─────────────────────────────────────
    // The driver.js overlay and popover are hidden via an injected <style> so
    // the user can navigate and interact freely. The step listens for the
    // tutorial:tierAdvanced custom event dispatched from the venue page after
    // a successful tutorial.compete mutation that advanced the tier.
    {
      popover: { title: "", description: "", showButtons: [] },
      onHighlighted: () => {
        document.getElementById("tutorial-unguided-phase")?.remove()
        const styleEl = document.createElement("style")
        styleEl.id = "tutorial-unguided-phase"
        // Driver disables pointer events on the entire page while active.
        // The interaction guard still limits clicks to the controls in step 96.
        styleEl.textContent = `.driver-overlay,.driver-stage,.driver-popover{display:none!important}body.driver-active header *,body.driver-active main *{pointer-events:auto!important}`
        document.head.appendChild(styleEl)

        const handler = (event: Event) => {
          const detail = (event as CustomEvent<{ disciplineName: string }>).detail
          capturedDisciplineName = detail?.disciplineName ?? ""
          ;(window as any).__tutorialTierAdvancedCleanup?.()
          ctrl.moveNext()
        }
        window.addEventListener("tutorial:tierAdvanced" as "click", handler)
        ;(window as any).__tutorialTierAdvancedCleanup = () => {
          window.removeEventListener("tutorial:tierAdvanced" as "click", handler)
          document.getElementById("tutorial-unguided-phase")?.remove()
        }
      },
      onDeselected: () => {
        ;(window as any).__tutorialTierAdvancedCleanup?.()
        delete (window as any).__tutorialTierAdvancedCleanup
      },
    },

    // ── [97] "A New Tier" ─────────────────────────────────────────────────
    {
      onHighlighted: () => { callbacks.completeStep("step_unguided_compete").catch(console.error) },
      popover: {
        title: "A New Tier",
        description: "Congratulations! She's advanced to the next tier. Finish her care for today, then let her rest. We'll continue preparing her for breeding tomorrow.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          if (capturedDisciplineName) {
            popover.description.textContent = `Congratulations! She's advanced to the next tier in ${capturedDisciplineName}. Finish her care for today, then let her rest. We'll continue preparing her for breeding tomorrow.`
          }
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [98] "Ready for Tomorrow" — finish any pending care, then age ─────
    // Full-page prompt rather than an advance-age spotlight: the player may
    // still owe care for the cycle, and anchoring straight to the age button
    // left them with no way to finish it. Dismissing the prompt with "Okay"
    // hides the overlay and pulses whatever is still outstanding — the pending
    // care actions and the age button — the same shape as the venue pick at [84].
    {
      disableActiveInteraction: false,
      popover: {
        title: "Ready for Tomorrow",
        description: "She's taken care of for the day. Advance her age when you're ready.",
        showButtons: ["next"],
        nextBtnText: "Okay",
        // The default line assumes the day's care is done. When any of it is
        // still outstanding the pulses below will include those actions, so the
        // prompt has to ask for them too.
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const carePending = document.querySelector(
            '[data-tutorial="daily-care-perform"],[data-tutorial="care-groom"],[data-tutorial="ltc-perform"]',
          )
          if (carePending) {
            popover.description.textContent = "She's taken care of for the day. Finish her care and advance her age when you're ready."
          }
        },
        onNextClick: () => {
          // driver.js drops pointer events on the body while a step is active, so
          // hiding the overlay is not enough on its own — main has to be restored
          // too. The capture-phase interaction guard still blocks everything the
          // step's policy doesn't allow, which here is care and the age button.
          if (document.getElementById("tutorial-ready-tomorrow")) return
          const styleEl = document.createElement("style")
          styleEl.id = "tutorial-ready-tomorrow"
          styleEl.textContent = `.driver-overlay,.driver-stage,.driver-popover{display:none!important}body.driver-active main *{pointer-events:auto!important}`
          document.head.appendChild(styleEl)
        },
      },
      onHighlighted: () => {
        injectPulseStyle()
        // Completed care actions render "Done" in place of their button, so
        // selecting the buttons themselves already limits this to what is still
        // pending; the enabled check keeps mid-request rows from flashing.
        const CARE_SEL = '[data-tutorial="daily-care-perform"],[data-tutorial="care-groom"],[data-tutorial="ltc-perform"]'
        const AGE_SEL = '[data-tutorial="advance-age"]'
        const pulse = () => {
          document.querySelectorAll<HTMLButtonElement>(`${CARE_SEL},${AGE_SEL}`).forEach(el => {
            el.classList.toggle("tutorial-pulse", !el.disabled)
          })
        }
        pulse()
        // Care rows unmount as they complete and the age button re-renders after
        // each mutation, so re-apply on an interval rather than once.
        const timer = setInterval(pulse, 300)
        const onAdvanced = () => ctrl.moveNext()
        window.addEventListener("tutorial:ageAdvanced", onAdvanced, { once: true })
        ;(window as any).__tutorialReadyTomorrowCleanup = () => {
          clearInterval(timer)
          window.removeEventListener("tutorial:ageAdvanced", onAdvanced)
          document.querySelectorAll(".tutorial-pulse").forEach(el => el.classList.remove("tutorial-pulse"))
        }
      },
      onDeselected: () => {
        ;(window as any).__tutorialReadyTomorrowCleanup?.()
        delete (window as any).__tutorialReadyTomorrowCleanup
        document.getElementById("tutorial-ready-tomorrow")?.remove()
        removePulseStyle()
      },
    },

    // ── [99] "Something's Wrong" — illness alert banner ───────────────────
    // The banner appears after the advanceAge mutation resolves and the animal
    // profile is invalidated. waitForElement gives time for the refetch.
    {
      element: '[data-tutorial="illness-alert-banner"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      onHighlighted: () => { callbacks.completeStep("step_ready_for_tomorrow").catch(console.error) },
      popover: {
        title: "Something's Wrong",
        description: "Your mare has developed an unknown illness overnight. Let's check her Health panel.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [100] "Unknown Illness" — health panel spotlight ──────────────────
    {
      element: '[data-tutorial="health-unknown-illness"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Unknown Illness",
        description: "We know she's unwell, but we don't know what's causing it yet. A vet exam will identify the condition and help us choose a treatment.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [101] "Visit the Vet" — spotlight visit-vet link in owner actions ─
    {
      element: '[data-tutorial="visit-vet"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Visit the Vet",
        description: "Visit the vet here.",
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

    // ── [102] "Choosing an Exam" — introduce the available exams ─────────
    {
      element: '[data-tutorial="exam-service-list"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        // The exam grid sits low in a page that doesn't scroll, so only the space
        // above it can hold the popover — left and right are too narrow and below
        // is shorter than the popover. Left to pick a side itself, Driver lands on
        // one of those and covers the very options the step is describing.
        side: "top",
        align: "start",
        title: "Choosing an Exam",
        description: "The vet offers several exams. Each can identify different conditions, so the right choice depends on what you need to find out.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [103] "Exam Credits" — premium grant ──────────────────────────────
    {
      element: '[data-tutorial="premium-balance"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Exam Credits",
        description: "We want her feeling her best, let's go with the Comprehensive Exam. Here are 3 Credits to help cover her veterinary care.",
        showButtons: ["next"],
        onPopoverRender: (popover: { nextButton: HTMLButtonElement }) => {
          popover.nextButton.textContent = "+ 3 Credits"
          popover.nextButton.style.cssText += "; padding: 8px 20px; font-size: 14px; letter-spacing: 0.02em;"
        },
        onNextClick: () => {
          const btn = document.querySelector<HTMLButtonElement>("#driver-popover-content .driver-popover-next-btn")
          if (!btn || btn.disabled) return
          btn.disabled = true
          btn.textContent = "Adding…"
          void callbacks.grantPremium().then(() => ctrl.moveNext()).catch((error) => {
            console.error("Tutorial credit grant failed:", error)
            btn.disabled = false
            btn.textContent = "+ 3 Credits"
            const description = document.querySelector<HTMLElement>("#driver-popover-content .driver-popover-description")
            if (description) description.textContent = "Credits could not be added. Please try again."
          })
        },
      },
    },

    // ── [104] "Pick Exam" — select the comprehensive exam ────────────────
    {
      element: '[data-tutorial="comprehensive-exam-option"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Pick Exam",
        description: "The Comprehensive Exam can diagnose any active illness.",
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

    // ── [105] "Run Exam" — diagnose the condition ───────────────────────
    {
      element: '[data-tutorial="run-exam-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Run Exam",
        description: "Run the exam to find out what’s wrong with her.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onExamCompleted = () => ctrl.moveNext()
        window.addEventListener("tutorial:examCompleted", onExamCompleted, { once: true })
        ;(window as any).__tutorialExamCompletedCleanup = () => window.removeEventListener("tutorial:examCompleted", onExamCompleted)
      },
      onDeselected: (el?: Element) => {
        ;(window as any).__tutorialExamCompletedCleanup?.()
        delete (window as any).__tutorialExamCompletedCleanup
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [106] "Diagnosed" — exam result spotlight ─────────────────────────
    // Waits for the health records refetch to complete after the exam mutation.
    {
      element: '[data-tutorial="diagnosed-condition-row"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Diagnosed",
        description: "Your mare has been diagnosed.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = document.querySelector('[data-tutorial="diagnosed-condition-row"] p.text-sm')?.textContent?.trim()
          capturedConditionName = name ?? ""
          if (name) popover.description.textContent = `Your mare has been diagnosed. The result revealed she has: ${name}.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [107] "Return" — spotlight vet-back-link ──────────────────────────
    {
      element: '[data-tutorial="vet-back-link"]',
      waitForElement: 3000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Return",
        description: "Let’s return to her page to review the treatment options.",
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

    // ── [108] "Treatment Options" — health panel, choose a treatment ──────
    // Waits for navigation back to the mare’s profile and the health data to load.
    {
      element: '[data-tutorial="health-diagnosed-condition"]',
      waitForElement: 10000,
      disableActiveInteraction: false,
      popover: {
        title: "Treatment Options",
        description: "Confirm the treatment.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = capturedConditionName ||
            document.querySelector('[data-tutorial="health-diagnosed-condition"] .text-sm.font-semibold')?.textContent?.trim()
          if (name) {
            popover.description.textContent = `Some conditions have more than one treatment option. ${name} requires OTC medication to treat. Confirm the treatment.`
          }
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="health-treatment-option"]')
          .forEach(btn => btn.classList.add("tutorial-pulse"))
        const handler = () => ctrl.moveNext()
        window.addEventListener("tutorial:treatmentStarted", handler, { once: true })
        ;(el as any).__tutorialTreatmentCleanup = () => {
          window.removeEventListener("tutorial:treatmentStarted", handler)
          document.querySelectorAll('[data-tutorial="health-treatment-option"]')
            .forEach(btn => btn.classList.remove("tutorial-pulse"))
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialTreatmentCleanup?.()
      },
    },

    // ── [109] "Treatment Active" — spotlight active treatment block ───────
    // Waits for the profile to refetch after startTreatment invalidates it.
    {
      element: '[data-tutorial="health-active-treatment"]',
      waitForElement: 10000,
      disableActiveInteraction: true,
      popover: {
        title: "Treatment Item",
        description: "We need to treat with the prescribed medication.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const treatmentEl = document.querySelector('[data-tutorial="health-active-treatment"]')
          const paragraphs = Array.from(treatmentEl?.querySelectorAll("p") ?? [])
          const missingP = paragraphs.find(p => p.textContent?.startsWith("Missing: "))
          const durationP = paragraphs.find(p => p.textContent?.includes("cycle"))
          capturedTreatmentItem = treatmentEl?.getAttribute("data-treatment-item") || missingP?.textContent?.replace("Missing: ", "").trim() || ""
          const match = durationP?.textContent?.match(/(\d+)\s+cycle/)
          capturedTreatmentDuration = Number(treatmentEl?.getAttribute("data-treatment-duration")) || (match ? parseInt(match[1]) : 2)
          popover.description.textContent = `We need to treat with ${capturedTreatmentItem || "the prescribed medication"}.`
        },
        onNextClick: () => {
          if (treatmentDetailPhase === 0) {
            treatmentDetailPhase = 1
            const title = document.querySelector(".driver-popover-title")
            const description = document.querySelector(".driver-popover-description")
            if (title) title.textContent = "Treatment Duration"
            if (description) description.textContent = `For ${capturedTreatmentDuration} cycle${capturedTreatmentDuration === 1 ? "" : "s"}.`
            pulseTreatmentDetail('[data-tutorial="treatment-duration"]')
          } else ctrl.moveNext()
        },
      },
      onHighlighted: (el?: Element) => {
        callbacks.completeStep("step_visit_vet").catch(console.error)
        if (!el) return
        capturedTreatmentItem = el.getAttribute("data-treatment-item") || capturedTreatmentItem
        capturedTreatmentDuration = Number(el.getAttribute("data-treatment-duration")) || capturedTreatmentDuration
        sessionStorage.setItem("tutorial:treatment", JSON.stringify({ item: capturedTreatmentItem, duration: capturedTreatmentDuration }))
        treatmentDetailPhase = 0
        injectPulseStyle()
        pulseTreatmentDetail('[data-tutorial="treatment-required-item"]')
      },
      onDeselected: () => {
        clearTreatmentPulse()
        removePulseStyle()
      },
    },

    // ── [110] "Buy at Vet" — spotlight buy-at-vet link ────────────────────
    {
      element: '[data-tutorial="buy-at-vet"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Buy at Vet",
        description: "You can buy OTC medication directly from the vet here.",
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

    // ── [111] "Purchase Prompt" — full-page on vet OTC page ───────────────
    // Marks the required item's buy button before the player clicks anything.
    {
      popover: {
        title: "Purchase Medication",
        description: "Purchase the required medication.",
        showButtons: ["next"],
        onPopoverRender: (popover: { title: HTMLElement; description: HTMLElement }) => {
          restoreTreatmentDetails()
          const count = Math.max(1, capturedTreatmentDuration)
          const item = capturedTreatmentItem || "the required medication"
          popover.title.textContent = `Purchase ${count} Unit${count !== 1 ? "s" : ""} of ${item}`
          popover.description.textContent = `You'll need ${count} unit${count !== 1 ? "s" : ""} to complete the full course of treatment.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        restoreTreatmentDetails()
        // Mark the correct buy button for the policy's controls restriction
        const cards = document.querySelectorAll('[data-tutorial="otc-listing-card"]')
        cards.forEach(card => {
          const name = card.querySelector('[data-tutorial="otc-listing-name"]')?.textContent?.trim()
          if (name === capturedTreatmentItem) {
            const btn = card.querySelector('[data-tutorial="otc-buy-btn"]')
            if (btn) btn.setAttribute('data-tutorial', 'otc-buy-required')
          }
        })
      },
    },

    // ── [112] "OTC Purchase" — buy the required item ─────────────────────
    // Waits for the player to purchase enough units (capturedTreatmentDuration).
    {
      element: '[data-tutorial="otc-buy-required"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Buy Medication",
        description: "Purchase the required units.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          restoreTreatmentDetails()
          const count = Math.max(1, capturedTreatmentDuration)
          popover.description.textContent = `Buy ${count} unit${count !== 1 ? "s" : ""} to complete her treatment course.`
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        _otcPurchaseCount = Number(el.closest('[data-tutorial="otc-listing-card"]')?.getAttribute("data-owned") ?? 0)
        if (_otcPurchaseCount >= Math.max(1, capturedTreatmentDuration)) {
          queueMicrotask(() => ctrl.moveNext())
          return
        }
        const onPurchased = () => {
          _otcPurchaseCount++
          if (_otcPurchaseCount >= Math.max(1, capturedTreatmentDuration)) {
            ;(window as any).__tutorialOTCCleanup?.()
            delete (window as any).__tutorialOTCCleanup
            ctrl.moveNext()
          }
        }
        window.addEventListener("tutorial:otcPurchased", onPurchased)
        ;(window as any).__tutorialOTCCleanup = () => window.removeEventListener("tutorial:otcPurchased", onPurchased)
      },
      onDeselected: (el?: Element) => {
        ;(window as any).__tutorialOTCCleanup?.()
        delete (window as any).__tutorialOTCCleanup
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
        // Restore the button's original data-tutorial so it's no longer restricted
        el?.setAttribute('data-tutorial', 'otc-buy-btn')
      },
    },

    // ── [113] "Return" — vet-back-link after purchasing medication ─────────
    {
      element: '[data-tutorial="vet-back-link"]',
      waitForElement: 3000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Return",
        description: "Return to your mare's page to administer her treatment.",
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

    // ── [114] "Administer OTC" — spotlight condition, pulse administer btn ─
    {
      element: '[data-tutorial="health-diagnosed-condition"]',
      waitForElement: 10000,
      disableActiveInteraction: false,
      popover: {
        title: "Administer Treatment",
        description: "Click below to give her first dose.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = conditionName()
          popover.description.textContent = name
            ? `Administer her first dose of treatment for ${name}.`
            : "Click below to give her first dose."
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="administer-btn"]')
          .forEach(btn => btn.classList.add("tutorial-pulse"))
        const handler = () => ctrl.moveNext()
        window.addEventListener("tutorial:treatmentAdministered", handler, { once: true })
        ;(el as any).__tutorialAdministerCleanup = () => {
          window.removeEventListener("tutorial:treatmentAdministered", handler)
          document.querySelectorAll('[data-tutorial="administer-btn"]')
            .forEach(btn => btn.classList.remove("tutorial-pulse"))
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialAdministerCleanup?.()
      },
    },

    // ── [115] "Treatment Started" — full-page + completeStep("step_visit_vet")
    {
      popover: {
        title: "Treatment Started",
        description: "You've begun her treatment. Complete the full course to ensure a full recovery.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = conditionName()
          if (name) {
            popover.description.textContent = `You've successfully begun her treatment for ${name}. It's important to complete the full course of medication to protect her health and well-being.`
          }
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [116] "Looking Beyond Today" — genetics intro full-page ──────────
    {
      popover: {
        title: "Looking Beyond Today",
        description: "Treating an illness addresses what's happening now, but a horse's health and breeding future can also be shaped by what they inherit. Genetic testing helps uncover information that may not be visible otherwise.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [117] "Genetic Testing" — spotlight the Genetics tab ─────────────
    {
      element: '[data-tutorial="genetics-tab"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Genetic Testing",
        description: "Let's take a look at her genetic testing.",
        showButtons: ["next"],
        onNextClick: () => {
          prepareTutorialControl('[data-tutorial="genetics-tab"]')
          ctrl.moveNext()
        },
      },
    },

    // ── [118] "Color Genetics" — spotlight color sub-tab ─────────────────
    {
      element: '[data-tutorial="genetics-tab-color"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Color Genetics",
        description: "Color testing reveals the genes behind a horse's coat color and markings, including traits they may carry without showing.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [119] "Health Genetics" — spotlight health sub-tab (info only) ───
    {
      element: '[data-tutorial="genetics-tab-health"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Health Genetics",
        description: "Health testing identifies inherited conditions a horse may be affected by or carry, making it especially important when planning breedings.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [120] "Conformation Genetics" — spotlight conformation sub-tab ───
    {
      element: '[data-tutorial="genetics-tab-conformation"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Conformation Genetics",
        description: "Conformation testing reveals the inherited traits behind a horse's physical structure, helping you understand how that structure may affect the horse and future offspring.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [121] "Stat Genetics" — spotlight stats sub-tab ──────────────────
    {
      element: '[data-tutorial="genetics-tab-stats"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Stat Genetics",
        description: "Stat genetics provide insight into the performance potential a horse can pass on to its offspring.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [122] "Check Her Health Genetics" — require health tab click ──────
    {
      element: '[data-tutorial="genetics-tab-health"]',
      waitForElement: 3000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Check Her Health Genetics",
        description: "For a breeding horse, inherited health is especially important. Let's look at the progress of her health testing.",
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

    // ── [123] "Genetic Progress" — overview of health loci ───────────────
    {
      element: '[data-tutorial="genetics-health-content"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Genetic Progress",
        description: "Most of her genetic testing is complete. You can learn more about loci, alleles, and inheritance through the town directory. For now, let's focus on testing the remaining genes.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="genetics-revealed-locus"]').forEach(el => el.classList.add("tutorial-pulse"))
      },
      onDeselected: () => {
        document.querySelectorAll('[data-tutorial="genetics-revealed-locus"]').forEach(el => el.classList.remove("tutorial-pulse"))
        removePulseStyle()
      },
    },

    // ── [124] "Testing Methods" — pulse test btn + tests-remaining badge ──
    // Spotlights the whole genetics panel rather than just the health grid, so
    // the sub-tab row is inside the cutout — the "x tests left" badge lives
    // there and is one of the things this step pulses.
    {
      element: '[data-tutorial="genetics-panel"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Testing Methods",
        description: "There are two ways to test genetics. Free testing allows you to test an individual gene — this is limited per day. You can also pay to test a full genetic panel, which is unlimited.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="genetics-test-locus-btn"]')
          .forEach(el => el.classList.add("tutorial-pulse"))
        document.querySelector('[data-tutorial="genetics-tests-remaining"]')
          ?.classList.add("tutorial-pulse")
        document.querySelectorAll('[data-tutorial="genetics-test-panel-btn"]')
          .forEach(el => el.classList.add("tutorial-pulse"))
      },
      onDeselected: () => {
        removePulseStyle()
        document.querySelectorAll('[data-tutorial="genetics-test-locus-btn"]')
          .forEach(el => el.classList.remove("tutorial-pulse"))
        document.querySelector('[data-tutorial="genetics-tests-remaining"]')
          ?.classList.remove("tutorial-pulse")
        document.querySelectorAll('[data-tutorial="genetics-test-panel-btn"]')
          .forEach(el => el.classList.remove("tutorial-pulse"))
      },
    },

    // ── [125] "Individual Test" — near-complete panel, one untested locus ─
    // Marks the untested locus button as "genetics-test-locus-target" so only
    // that button is allowed by the interaction guard.
    {
      element: '[data-tutorial="genetics-health-panel-near-complete"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Individual Test",
        description: "This panel is almost completely tested, let's test the remaining gene.",
        showButtons: [],
      },
      onHighlighted: () => {
        injectPulseStyle()
        const nearPanel = document.querySelector('[data-tutorial="genetics-health-panel-near-complete"]')
        const testBtn = nearPanel?.querySelector('[data-tutorial="genetics-test-locus-btn"]')
        if (testBtn) {
          testBtn.setAttribute('data-tutorial', 'genetics-test-locus-target')
          testBtn.classList.add("tutorial-pulse")
        }
        const onTestComplete = (event: Event) => {
          if ((event as CustomEvent<string>).detail === "locus") ctrl.moveNext()
        }
        window.addEventListener("tutorial:geneticTestComplete", onTestComplete, { once: true })
        ;(window as any).__tutorialLocusTestCleanup = () => window.removeEventListener("tutorial:geneticTestComplete", onTestComplete)
      },
      onDeselected: () => {
        ;(window as any).__tutorialLocusTestCleanup?.()
        delete (window as any).__tutorialLocusTestCleanup
        removePulseStyle()
        // Restore button attribute
        const target = document.querySelector('[data-tutorial="genetics-test-locus-target"]')
        if (target) {
          target.classList.remove("tutorial-pulse")
          target.setAttribute('data-tutorial', 'genetics-test-locus-btn')
        }
      },
    },

    // ── [126] "Panel Test" — fully untested panel ─────────────────────────
    // Marks the untested panel's test-panel button as "genetics-test-panel-target".
    {
      element: '[data-tutorial="genetics-health-panel-untested"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Panel Test",
        description: "We can use a full panel test here to test all remaining genes at once.",
        showButtons: [],
      },
      onHighlighted: () => {
        injectPulseStyle()
        const untestedPanel = document.querySelector('[data-tutorial="genetics-health-panel-untested"]')
        const testPanelBtn = untestedPanel?.querySelector('[data-tutorial="genetics-test-panel-btn"]')
        if (testPanelBtn) {
          testPanelBtn.setAttribute('data-tutorial', 'genetics-test-panel-target')
          testPanelBtn.classList.add("tutorial-pulse")
        }
        const onTestComplete = (event: Event) => {
          if ((event as CustomEvent<string>).detail === "panel") ctrl.moveNext()
        }
        window.addEventListener("tutorial:geneticTestComplete", onTestComplete, { once: true })
        ;(window as any).__tutorialPanelTestCleanup = () => window.removeEventListener("tutorial:geneticTestComplete", onTestComplete)
      },
      onDeselected: () => {
        ;(window as any).__tutorialPanelTestCleanup?.()
        delete (window as any).__tutorialPanelTestCleanup
        removePulseStyle()
        const target = document.querySelector('[data-tutorial="genetics-test-panel-target"]')
        if (target) {
          target.classList.remove("tutorial-pulse")
          target.setAttribute('data-tutorial', 'genetics-test-panel-btn')
        }
      },
    },

    // ── [127] Genetics Complete — transition to care/recovery ────────────
    {
      popover: {
        title: "Genetics Complete",
        description: "Her health genetic testing is complete.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => { callbacks.completeStep("step_genetics_done").catch(console.error) },
    },

    // ── [128] "Back to Her Care" — complete today's care ────────────────
    {
      element: '[data-tutorial="daily-care-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Back to Her Care",
        description: "Her genetic testing is taken care of. Before we move on, let's finish her daily care.",
        showButtons: [],
      },
      onHighlighted: () => {
        ;(window as any).__tutorialCareCleanup = waitForDailyCare(ctrl)
      },
      onDeselected: () => {
        ;(window as any).__tutorialCareCleanup?.()
        delete (window as any).__tutorialCareCleanup
      },
    },

    // ── [129] "Continue Her Recovery" — spotlight advance-age ─────────────
    {
      element: '[data-tutorial="advance-age"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Continue Her Recovery",
        description: "Her care is complete and her treatment is underway. Age her when you're ready to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onAdvanced = () => ctrl.moveNext()
        window.addEventListener("tutorial:ageAdvanced", onAdvanced, { once: true })
        ;(el as any).__tutorialAgeCleanup = () => window.removeEventListener("tutorial:ageAdvanced", onAdvanced)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialAgeCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [130] "Daily Care" — treatment day care ──────────────────────────
    {
      element: '[data-tutorial="daily-care-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Daily Care",
        description: "She still has an active treatment, so let's take care of her before giving her next dose.",
        showButtons: [],
      },
      onHighlighted: () => {
        ;(window as any).__tutorialCareCleanup = waitForDailyCare(ctrl)
      },
      onDeselected: () => {
        ;(window as any).__tutorialCareCleanup?.()
        delete (window as any).__tutorialCareCleanup
      },
    },

    // ── [131] "Continue Treatment" — administer second dose ───────────────
    {
      element: '[data-tutorial="health-diagnosed-condition"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Continue Treatment",
        description: "Continue her treatment as prescribed.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="administer-btn"]')
          .forEach(btn => btn.classList.add("tutorial-pulse"))
        const handler = () => ctrl.moveNext()
        window.addEventListener("tutorial:treatmentAdministered", handler, { once: true })
        ;(el as any).__tutorialAdministerCleanup = () => {
          window.removeEventListener("tutorial:treatmentAdministered", handler)
          document.querySelectorAll('[data-tutorial="administer-btn"]')
            .forEach(btn => btn.classList.remove("tutorial-pulse"))
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialAdministerCleanup?.()
      },
    },

    // ── [132] "Finish Her Recovery" — advance age, listen for conditionResolved
    {
      element: '[data-tutorial="advance-age"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Finish Her Recovery",
        description: "That completes her treatment. Age her once more to see how she responds.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onResolved = () => ctrl.moveNext()
        window.addEventListener("tutorial:conditionResolved", onResolved, { once: true })
        ;(window as any).__tutorialConditionResolvedCleanup = () => window.removeEventListener("tutorial:conditionResolved", onResolved)
      },
      onDeselected: (el?: Element) => {
        ;(window as any).__tutorialConditionResolvedCleanup?.()
        delete (window as any).__tutorialConditionResolvedCleanup
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [133] "Recovered" — full-page popover after condition clears ──────
    {
      popover: {
        title: "Recovered",
        description: "By completing the full course of treatment, you've helped her make a full recovery.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [134] "A Legacy Begins" — transition to breeding ─────────────────
    {
      popover: {
        title: "A Legacy Begins",
        description: "She’s ready. You’ve developed her, cared for her, and proven her in competition.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => { callbacks.completeStep("step_legacy_begins").catch(console.error) },
    },

    // ── [135] Breeding Grade spotlight ───────────────────────────────────
    {
      element: '[data-tutorial="breeding-grade"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Her Breeding Grade",
        description: "All that work has paid off. Her Breeding Grade has reached A. Now it’s time to begin the next generation.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [136] Browse Stud Market nav ──────────────────────────────────────
    {
      element: '[data-tutorial="browse-stud-market"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Find a Stallion",
        description: "The Stud Market is where you'll find stud listings from other players. Let's browse and find a good match for her.",
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

    // ── [137] Stud Market — listing overview + checkpoint ─────────────────
    {
      popover: {
        title: "The Stud Market",
        description: "Each listing represents a stallion available for breeding. You can review his breed, generation, competition record, conformation score, and personality before making a choice.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => { callbacks.completeStep("step_stud_market").catch(console.error) },
    },

    // ── [138] Select the listing card ─────────────────────────────────────
    {
      element: '[data-tutorial="tutorial-stud-listing-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        title: "View the Listing",
        description: "Select a listing to see the full stud advertisement.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const handler = (event: MouseEvent) => {
          if (!(event.target instanceof Element)) return
          const card = event.target.closest('[data-tutorial="tutorial-stud-listing-card"]')
          if (!card) return
          // The card toggles selection, so clicking an already-selected one closes the
          // detail panel. The next step spotlights that panel, and advancing without it
          // leaves Driver waiting out waitForElement for something that will never
          // appear, then recovering to the dashboard. Only advance once it is open.
          let attempts = 0
          const advanceWhenOpen = () => {
            if (!document.querySelector('[data-tutorial="stud-detail-panel"]')) {
              if (attempts++ < 10) setTimeout(advanceWhenOpen, 50)
              return
            }
            const listingId = card.getAttribute("data-listing-id")
            if (listingId) saveTutorialListingId(listingId)
            document.removeEventListener("click", handler, true)
            ctrl.moveNext()
          }
          setTimeout(advanceWhenOpen, 0)
        }
        document.addEventListener("click", handler, true)
        ;(el as any).__tutorialStudCardCleanup = () => document.removeEventListener("click", handler, true)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialStudCardCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [139] Stud Advertisement — detail panel info ───────────────────────
    {
      element: '[data-tutorial="stud-detail-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Stud Advertisement",
        description: "Here you can review the stallion's full advertisement — breed, generation, competition record, conformation, personality, and any breeding restrictions the owner has set.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [140] Meet the Stud — navigate to stallion profile ────────────────
    {
      element: '[data-tutorial="stud-view-animal-page"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Meet the Stud",
        description: "Visit his animal page to review his full profile before committing to a booking.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const href = (el as HTMLAnchorElement).href ?? el.querySelector("a")?.href
        if (href) {
          const stallionId = new URL(href, location.origin).pathname.split("/")[2]
          if (stallionId) saveTutorialStallionId(stallionId)
        }
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [141] Review His Profile — full-page prompt, then free exploration ──
    // Dismissing with "Okay" hides the prompt and overlay and leaves the page
    // browsable, the same shape as the venue pick at [84]. The workspace tabs,
    // the genetics sub-tabs and View Stud Ad are what the step's policy allows,
    // so the interaction guard keeps everything else blocked without an overlay.
    {
      disableActiveInteraction: false,
      popover: {
        title: "Review His Profile",
        description: "Take a look at his full profile — pedigree, genetics, competition history, and offspring. When you're ready, click View Stud Ad to return and book the breeding.",
        showButtons: ["next"],
        nextBtnText: "Okay",
        onNextClick: () => {
          if (document.getElementById("tutorial-profile-exploration")) return
          const styleEl = document.createElement("style")
          styleEl.id = "tutorial-profile-exploration"
          styleEl.textContent = `.driver-overlay,.driver-stage,.driver-popover{display:none!important}body.driver-active main *{pointer-events:auto!important}`
          document.head.appendChild(styleEl)
        },
      },
      onHighlighted: () => {
        injectPulseStyle()
        // The button lives in a panel that re-renders as profile queries settle,
        // which drops a class applied once — so reapply it on an interval.
        const pulse = () => document.querySelectorAll('[data-tutorial="view-stud-ad-btn"]')
          .forEach(el => el.classList.add("tutorial-pulse"))
        pulse()
        const timer = setInterval(pulse, 300)
        const handler = (event: MouseEvent) => {
          if (!(event.target instanceof Element)) return
          const link = event.target.closest<HTMLAnchorElement>('[data-tutorial="view-stud-ad-btn"]')
          if (!link) return
          const listingId = new URL(link.href, location.origin).searchParams.get("listingId")
          if (listingId) saveTutorialListingId(listingId)
          document.removeEventListener("click", handler, true)
          setTimeout(() => ctrl.moveNext(), 0)
        }
        document.addEventListener("click", handler, true)
        ;(window as any).__tutorialViewStudAdCleanup = () => {
          clearInterval(timer)
          document.removeEventListener("click", handler, true)
          document.querySelectorAll('[data-tutorial="view-stud-ad-btn"]').forEach(el => el.classList.remove("tutorial-pulse"))
          document.getElementById("tutorial-profile-exploration")?.remove()
        }
      },
      onDeselected: () => {
        ;(window as any).__tutorialViewStudAdCleanup?.()
        delete (window as any).__tutorialViewStudAdCleanup
        removePulseStyle()
      },
    },

    // ── [142] Book a Breeding — stud market book button ───────────────────
    {
      element: '[data-tutorial="stud-book-btn"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Book a Breeding",
        description: "Click Book to begin the breeding process.",
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

    // ── [143] Choose the Dam — female selector + checkpoint ───────────────
    {
      element: '[data-tutorial="breeding-female-select"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        // Anchored above: left to Driver this lands ~14px below the select, which
        // is exactly where the native option list drops down. A click meant for an
        // option then hits the popover instead, so the dropdown closes with nothing
        // selected — the same trap as the naming step's Confirm button.
        side: "top",
        align: "start",
        title: "Choose the Dam",
        description: "Select your mare from the dropdown to pair her with the stallion.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        callbacks.completeStep("step_breeding_page").catch(console.error)
        // The dropdown's first option is the blank "Choose a female…" placeholder.
        // Advancing on that change leaves the player on the next step with no dam,
        // whose parent cards never render — Driver then times out and recovers to
        // the dashboard, and the select is no longer an allowed control.
        // A native select commits its choice on the trailing click that follows
        // change. Advancing synchronously here flips the step before that click
        // lands, so the guard — now on a step where this control is not allowed —
        // preventDefault()s it and the browser reverts the selection to the
        // placeholder. Wait for the parent cards instead: they only render once
        // React has committed the dam, which is also what the next step spotlights.
        const handler = (event: Event) => {
          if (!(event.target as HTMLSelectElement).value) return
          let attempts = 0
          const advanceWhenReady = () => {
            if (!document.querySelector('[data-tutorial="breeding-parent-cards"]')) {
              if (attempts++ < 20) setTimeout(advanceWhenReady, 50)
              return
            }
            el.removeEventListener("change", handler)
            ctrl.moveNext()
          }
          setTimeout(advanceWhenReady, 0)
        }
        el.addEventListener("change", handler)
        ;(el as any).__tutorialDamSelectCleanup = () => el.removeEventListener("change", handler)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialDamSelectCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [144] Compare the Pair — parent cards ─────────────────────────────
    {
      element: '[data-tutorial="breeding-parent-cards"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Compare the Pair",
        description: "Here you can compare both parents — their fertility, mood, and COI all factor into the quality of offspring they can produce.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [145] Conception Chance ───────────────────────────────────────────
    {
      element: '[data-tutorial="breeding-conception-chance"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Conception Chance",
        description: "The probability this breeding results in a pregnancy, influenced by both parents' fertility and mood.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [146] Offspring COI ───────────────────────────────────────────────
    {
      element: '[data-tutorial="breeding-offspring-coi"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Offspring COI",
        description: "The coefficient of inbreeding for the expected offspring. Lower is generally healthier — it tells you how closely related the parents are.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [147] Stud Fee — skip automatically if listing is free ───────────
    {
      popover: {
        title: "Stud Fee",
        description: "This breeding has a stud fee that will be charged when you confirm.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        if (!document.querySelector('[data-tutorial="breeding-stud-fee"]')) {
          queueMicrotask(() => ctrl.moveNext())
        }
      },
    },

    // ── [148] Preview a Foal — run predictor ──────────────────────────────
    {
      element: '[data-tutorial="breeding-predictor"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Preview a Foal",
        description: "The Breeding Predictor lets you simulate a sample offspring before committing. Click Run Predictor to see what this pairing could produce.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        document.querySelectorAll('[data-tutorial="breeding-predictor-btn"]').forEach(btn => btn.classList.add("tutorial-pulse"))
        const onPredictorRun = () => ctrl.moveNext()
        window.addEventListener("tutorial:predictorRun", onPredictorRun, { once: true })
        ;(el as any).__tutorialPredictorCleanup = () => {
          window.removeEventListener("tutorial:predictorRun", onPredictorRun)
          document.querySelectorAll('[data-tutorial="breeding-predictor-btn"]').forEach(btn => btn.classList.remove("tutorial-pulse"))
        }
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialPredictorCleanup?.()
        removePulseStyle()
      },
    },

    // ── [149] One Possible Foal — predictor result info ───────────────────
    {
      element: '[data-tutorial="breeding-predictor-result"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "One Possible Foal",
        description: "This is a sample foal from this pairing. Stats and sex vary with each run — the predictor shows potential, not certainty. Ready to commit?",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [150] Confirm the Pairing ──────────────────────────────────────────
    {
      element: '[data-tutorial="breeding-confirm-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Confirm the Pairing",
        description: "Click to confirm the breeding. If successful, your mare will become pregnant.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onBreedingComplete = () => ctrl.moveNext()
        window.addEventListener("tutorial:breedingComplete", onBreedingComplete, { once: true })
        ;(el as any).__tutorialBreedingCleanup = () => window.removeEventListener("tutorial:breedingComplete", onBreedingComplete)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialBreedingCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [151] Conception Successful — waits for result card to render ──────
    {
      element: '[data-tutorial="breeding-result"]',
      waitForElement: 10000,
      disableActiveInteraction: true,
      popover: {
        title: "Conception Successful",
        description: "The breeding was successful. Your mare is now pregnant. Head back to her page to monitor the pregnancy.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [152] Go to mare ──────────────────────────────────────────────────
    {
      element: '[data-tutorial="breeding-go-to-mare-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Back to Her Page",
        description: "Head back to your mare's page to check on her pregnancy.",
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

    // ── [153] Active Pregnancy — breeding panel spotlight + checkpoint ──────
    {
      element: '[data-tutorial="active-pregnancy-block"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Active Pregnancy",
        description: "Your mare is pregnant. You can track gestation progress here — the bar shows how far along the pregnancy is.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => { callbacks.completeStep("step_pregnancy").catch(console.error) },
    },

    // ── [154] Embryo Flushing — info only, button visible but driver blocked
    {
      element: '[data-tutorial="flush-embryo-btn"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Embryo Flushing",
        description: "This lets you flush the embryo for storage — useful if you'd rather use a surrogate or save it for later implantation. We won't use it this time.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [155] Ultrasound — info only, locked until open cycle ─────────────
    {
      element: '[data-tutorial="ultrasound-btn"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Ultrasound",
        description: "Once the pregnancy reaches a certain stage, you can use the ultrasound to reveal the foal's sex and coat color. It's not available yet — continue caring for her and it will unlock.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [156] Unguided gestation — care + age freely, wait for ultrasoundReady
    {
      popover: { title: "", description: "", showButtons: [] },
      onHighlighted: () => {
        document.getElementById("tutorial-unguided-phase")?.remove()
        const styleEl = document.createElement("style")
        styleEl.id = "tutorial-unguided-phase"
        styleEl.textContent = `.driver-overlay,.driver-stage,.driver-popover{display:none!important}body.driver-active header *,body.driver-active main *{pointer-events:auto!important}`
        document.head.appendChild(styleEl)

        const onUltrasoundReady = () => {
          ;(window as any).__tutorialUltrasoundReadyCleanup?.()
          ctrl.moveNext()
        }
        window.addEventListener("tutorial:ultrasoundReady", onUltrasoundReady)
        ;(window as any).__tutorialUltrasoundReadyCleanup = () => {
          window.removeEventListener("tutorial:ultrasoundReady", onUltrasoundReady)
          document.getElementById("tutorial-unguided-phase")?.remove()
        }
        const ultrasound = document.querySelector<HTMLButtonElement>('[data-tutorial="ultrasound-btn"]')
        if (ultrasound && !ultrasound.disabled) queueMicrotask(onUltrasoundReady)
      },
      onDeselected: () => {
        ;(window as any).__tutorialUltrasoundReadyCleanup?.()
        delete (window as any).__tutorialUltrasoundReadyCleanup
      },
    },

    // ── [157] Ultrasound Available ────────────────────────────────────────
    {
      element: '[data-tutorial="ultrasound-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Ultrasound Available",
        description: "The pregnancy has progressed far enough for an ultrasound. Click to reveal the foal's sex and coat color.",
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

  ]
}
