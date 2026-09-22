import type { DriveStep } from "driver.js"
import type { TutorialCtrl, TutorialCallbacks } from "../types"
import { waitForElement } from "../utils/wait-for-element"

// Captured from the foal's profile heading once first visited.
let capturedFoalName = ""
// Captured from the breed directory / breed profile once visited.
let capturedBreedName = ""
// Captured from the foal's competition tier display.
let capturedTierName = ""

function foalName(): string {
  const visible = document.querySelector('[data-tutorial="animal-header"] h1')?.textContent?.trim()
  if (visible) capturedFoalName = visible
  return capturedFoalName || "your foal"
}

function breedName(): string {
  return capturedBreedName || "the breed"
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

// Expands every conformation section and pulses the loci relevant to `attr`
// ("terrain" or "climate"). The relevant loci are spread across several sections,
// so all of them are opened — a collapsed section renders no cards at all, and
// the step would spotlight an accordion with nothing visible to point at.
// The pulse repeats on an interval because the cards in the sections just opened
// only mount on React's next render, after this function has already returned.
function focusConformationLoci(attr: "terrain" | "climate") {
  unfocusConformationLoci()
  document.querySelectorAll<HTMLButtonElement>('[data-tutorial="conformation-section-btn"]').forEach(btn => {
    if (btn.dataset.sectionOpen !== "true") btn.click()
  })
  const pulse = () => document.querySelectorAll(`[data-tutorial-${attr}="true"]`)
    .forEach(card => card.classList.add("tutorial-pulse"))
  pulse()
  const pulseInterval = setInterval(pulse, 300)
  ;(window as any).__tutorialConformationLociCleanup = () => {
    clearInterval(pulseInterval)
    document.querySelectorAll(".tutorial-pulse").forEach(card => card.classList.remove("tutorial-pulse"))
  }
}
function unfocusConformationLoci() {
  ;(window as any).__tutorialConformationLociCleanup?.()
  delete (window as any).__tutorialConformationLociCleanup
}

// Shared by step [194]'s onNextClick (first visit, still on the foal's profile)
// and its onHighlighted (resuming away from it) — see that step for why.
function armPrepWatcher(ctrl: TutorialCtrl) {
  if ((window as any).__tutorialPrepCleanup) return
  injectUnguidedStyle()
  document.querySelector<HTMLElement>(".driver-popover")?.style.setProperty("display", "none")
  document.querySelector<SVGElement>(".driver-overlay")?.style.setProperty("display", "none")
  let finished = false
  const check = () => {
    const btn = document.querySelector<HTMLButtonElement>('[data-tutorial="view-venues-btn"]')
    if (!finished && btn && !btn.disabled) {
      finished = true
      observer.disconnect()
      ;(window as any).__tutorialPrepCleanup?.()
      removeUnguidedStyle()
      ctrl.moveNext()
    }
  }
  const observer = new MutationObserver(check)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  injectPulseStyle()
  const pulse = () => document.querySelectorAll('[data-tutorial="equip-action"], [data-tutorial="book-cert-testing"], [data-tutorial="visit-vet"], [data-tutorial="tutorial-shop-buy"], [data-tutorial="cert-issue-btn"]').forEach(el => el.classList.add("tutorial-pulse"))
  pulse()
  const pulseInterval = setInterval(pulse, 500)
  ;(window as any).__tutorialPrepCleanup = () => {
    observer.disconnect()
    clearInterval(pulseInterval)
    document.querySelectorAll(".tutorial-pulse").forEach(el => el.classList.remove("tutorial-pulse"))
    removeUnguidedStyle()
    removePulseStyle()
  }
  check()
}

// Shared by step [212]'s onNextClick (first visit) and onHighlighted (resuming
// away from the foal's profile) — see that step for why.
function armYoungstockWatcher(ctrl: TutorialCtrl) {
  if ((window as any).__tutorialYoungstockCleanup) return
  injectUnguidedStyle()
  document.querySelector<HTMLElement>(".driver-popover")?.style.setProperty("display", "none")
  document.querySelector<SVGElement>(".driver-overlay")?.style.setProperty("display", "none")
  const onAdvanced = (event?: Event) => {
    const age = (event as CustomEvent<{ ageInCycles?: number }> | undefined)?.detail?.ageInCycles
    const header = document.querySelector<HTMLElement>('[data-tutorial="animal-header"]')
    const cyclesPerYear = Number(header?.dataset.cyclesPerYear)
    if (!(Number.isFinite(age) && Number.isFinite(cyclesPerYear) && age! >= cyclesPerYear) && !hasReachedAge(1)) return
    ;(window as any).__tutorialYoungstockCleanup?.()
    ctrl.moveNext()
  }
  window.addEventListener("tutorial:ageAdvanced", onAdvanced)
  ;(window as any).__tutorialYoungstockCleanup = () => {
    window.removeEventListener("tutorial:ageAdvanced", onAdvanced)
    removeUnguidedStyle()
  }
  queueMicrotask(() => onAdvanced())
}

function injectUnguidedStyle() {
  document.getElementById("tutorial-unguided-phase")?.remove()
  const styleEl = document.createElement("style")
  styleEl.id = "tutorial-unguided-phase"
  styleEl.textContent = `.driver-overlay,.driver-stage,.driver-popover{display:none!important}body.driver-active header *,body.driver-active main *{pointer-events:auto!important}`
  document.head.appendChild(styleEl)
}

function removeUnguidedStyle() {
  document.getElementById("tutorial-unguided-phase")?.remove()
}

function hasReachedAge(monthFraction: number): boolean {
  const header = document.querySelector<HTMLElement>('[data-tutorial="animal-header"]')
  const age = Number(header?.dataset.ageCycles)
  const cyclesPerYear = Number(header?.dataset.cyclesPerYear)
  if (!Number.isFinite(age) || !Number.isFinite(cyclesPerYear) || cyclesPerYear <= 0) return false
  return age >= Math.ceil(cyclesPerYear * monthFraction)
}

export function foalSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  return [

    // ── [158] Ultrasound Result — "A First Look" ──────────────────────────
    {
      element: '[data-tutorial="ultrasound-result"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "A First Look",
        description: "The ultrasound reveals a little more about the foal on the way. Continue caring for the mare and advance her age when you're ready for the birth.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [159] Continue to Birth (unguided) ────────────────────────────────
    // Driver hides immediately. Waits for tutorial:birthDialogOpen which is
    // dispatched from OwnerView when birthPregnancyId becomes non-null.
    {
      element: '[data-tutorial="active-pregnancy-block"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "The Final Stretch",
        description: "Continue her usual care and advance her age until the foal arrives.",
        showButtons: ["next"],
        onNextClick: () => {
          injectUnguidedStyle()
          document.querySelector<HTMLElement>(".driver-popover")?.style.setProperty("display", "none")
          document.querySelector<SVGElement>(".driver-overlay")?.style.setProperty("display", "none")
          const onBirth = () => {
            ;(window as any).__tutorialBirthWaitCleanup?.()
            ctrl.moveNext()
          }
          window.addEventListener("tutorial:birthDialogOpen", onBirth)
          ;(window as any).__tutorialBirthWaitCleanup = () => {
            window.removeEventListener("tutorial:birthDialogOpen", onBirth)
            removeUnguidedStyle()
          }
          if (document.querySelector('[data-tutorial="birth-dialog"]')) queueMicrotask(onBirth)
        },
      },
      onHighlighted: () => {
        const onBirth = () => {
          ;(window as any).__tutorialBirthWaitCleanup?.()
          ctrl.moveNext()
        }
        if (document.querySelector('[data-tutorial="birth-dialog"]')) queueMicrotask(onBirth)
      },
      onDeselected: () => {
        ;(window as any).__tutorialBirthWaitCleanup?.()
        delete (window as any).__tutorialBirthWaitCleanup
      },
    },

    // ── [160] Birth Event — "A New Beginning" ─────────────────────────────
    {
      element: '[data-tutorial="birth-dialog"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "A New Beginning",
        description: "The foal has arrived!",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [161] Name the Foal ───────────────────────────────────────────────
    // Spotlights the name input in the birth dialog. Advances when the dialog
    // closes (birth mutation succeeds and dialog is unmounted).
    {
      element: '[data-tutorial="birth-name-input"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        title: "Name the Foal",
        description: "Give them a name, then confirm to welcome them to your stable.",
        showButtons: [],
        side: "right",
        align: "start",
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        document.querySelector('[data-tutorial="birth-name-confirm"]')?.classList.add("tutorial-pulse")
        let finished = false
        const check = () => {
          if (finished || document.querySelector('[data-tutorial="birth-name-confirm"]')) return
          finished = true
          observer.disconnect()
          ctrl.moveNext()
        }
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        ;(el as any).__tutorialBirthNameCleanup = () => {
          observer.disconnect()
          document.querySelector('[data-tutorial="birth-name-confirm"]')?.classList.remove("tutorial-pulse")
        }
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialBirthNameCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [162] Visit the New Horse ─────────────────────────────────────────
    {
      element: '[data-tutorial="stable-nav"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "The Next Generation",
        description: "Your new horse is waiting in the Stable. Let's visit their page.",
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

    // ── [163] Return the Mare ─────────────────────────────────────────────
    {
      element: '[data-tutorial="tutorial-return-mare-btn"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        title: "A Foundation Mare's Legacy",
        description: "Your mare's time with your stable is complete. She'll return to her breeder's foundation herd, where she can continue contributing to the breed's future. You'll receive 300G from the return agreement to invest in your new horse.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onReturned = () => ctrl.moveNext()
        window.addEventListener("tutorial:mareReturned", onReturned, { once: true })
        ;(el as any).__tutorialMareReturnCleanup = () => window.removeEventListener("tutorial:mareReturned", onReturned)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialMareReturnCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [164] Select the Foal (spec 166) ──────────────────────────────────
    {
      element: '[data-tutorial="tutorial-foal-stable-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Meet Your Foal",
        description: "Select your new horse to open their profile.",
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

    // ── [165] Early Development (spec 167) ────────────────────────────────
    {
      element: '[data-tutorial="animal-header"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Time to Grow",
        description: "Right now, their job is simply to grow and develop. More activities and opportunities will become available as they reach new life stages.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Right now, ${name}'s job is simply to grow and develop. More activities and opportunities will become available as they reach new life stages.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [166] Grow to Six Months (spec 168, unguided) ─────────────────────
    // Hides the driver overlay and waits until the exact six-month age.
    {
      popover: {
        title: "The First Six Months",
        description: "Continue caring for your foal and advance their age to six months.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Continue caring for ${name} and advance their age to six months.`
        },
        onNextClick: () => {
          injectUnguidedStyle()
          document.querySelector<HTMLElement>(".driver-popover")?.style.setProperty("display", "none")
          document.querySelector<SVGElement>(".driver-overlay")?.style.setProperty("display", "none")
          const onAdvanced = (event?: Event) => {
            const age = (event as CustomEvent<{ ageInCycles?: number }> | undefined)?.detail?.ageInCycles
            const header = document.querySelector<HTMLElement>('[data-tutorial="animal-header"]')
            const cyclesPerYear = Number(header?.dataset.cyclesPerYear)
            if (!(Number.isFinite(age) && Number.isFinite(cyclesPerYear) && age! >= Math.ceil(cyclesPerYear / 2)) && !hasReachedAge(0.5)) return
            ;(window as any).__tutorialSixMonthCleanup?.()
            ctrl.moveNext()
          }
          window.addEventListener("tutorial:ageAdvanced", onAdvanced)
          ;(window as any).__tutorialSixMonthCleanup = () => {
            window.removeEventListener("tutorial:ageAdvanced", onAdvanced)
            removeUnguidedStyle()
          }
          queueMicrotask(() => onAdvanced())
        },
      },
      onDeselected: () => {
        ;(window as any).__tutorialSixMonthCleanup?.()
        delete (window as any).__tutorialSixMonthCleanup
      },
    },

    // ── [167] Six-Month Milestone (spec 169) ─────────────────────────────
    {
      element: '[data-tutorial="animal-header"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Ready for Inspection",
        description: "At six months, your foal can complete a conformation inspection. Before arranging one, let's look at the breed standard they'll be evaluated against.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `At six months, ${name} can complete a conformation inspection. Before arranging one, let's look at the breed standard they'll be evaluated against.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [168] Open Directories (spec 170) ─────────────────────────────────
    {
      element: '[data-tutorial="directory-nav"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Directories",
        description: "Open the Directories menu.",
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

    // ── [169] Breed Directory (spec 171) ──────────────────────────────────
    {
      element: '[data-tutorial="breeds-directory-card"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Breed Directory",
        description: "The Breed Directory contains information about every recognized breed. Open it to find your foal's breed.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          const breed = breedName()
          popover.description.textContent = `The Breed Directory contains information about every recognized breed. Open it to find ${name}'s breed: ${breed}.`
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

    // ── [170] Select the Breed (spec 172) ─────────────────────────────────
    {
      element: '[data-tutorial="tutorial-breed-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        title: "Select Your Breed",
        description: "Select the breed card to view the full breed profile.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const breed = breedName()
          popover.description.textContent = `Select ${breed} to view the full breed profile.`
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const handler = (event: MouseEvent) => {
          if (!(event.target instanceof Element)) return
          const card = event.target.closest('[data-tutorial="tutorial-breed-card"]')
          if (!card) return
          // Capture the breed name from the card heading
          const name = card.querySelector('h3')?.textContent?.trim()
          if (name) capturedBreedName = name
          document.removeEventListener("click", handler, true)
          setTimeout(() => ctrl.moveNext(), 0)
        }
        document.addEventListener("click", handler, true)
        ;(el as any).__tutorialBreedSelectCleanup = () => document.removeEventListener("click", handler, true)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialBreedSelectCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [171] Breed Profile info (spec 173) ───────────────────────────────
    {
      popover: {
        title: "The Breed Profile",
        description: "Each breed profile covers its history, characteristics, health concerns, and conformation standard.",
        showButtons: ["next"],
        onPopoverRender: (popover: { title: HTMLElement; description: HTMLElement }) => {
          // Capture breed name from the page heading if available
          const h1 = document.querySelector("h1")?.textContent?.trim()
          if (h1) capturedBreedName = h1
          const breed = breedName()
          popover.title.textContent = breed ? `The ${breed}` : "The Breed Profile"
          popover.description.textContent = "Each breed profile covers its history, characteristics, health concerns, and conformation standard."
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [172] Open Breed Standard (spec 174) ─────────────────────────────
    {
      element: '[data-tutorial="breed-standard-tab"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Open the Breed Standard",
        description: "Open the Breed Standard tab to see how horses in this breed are evaluated.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const breed = breedName()
          popover.description.textContent = `Open the Breed Standard tab to see how ${breed} horses are evaluated.`
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

    // ── [173] Breed Standard info (spec 175) ─────────────────────────────
    {
      element: '[data-tutorial="breed-standard-content"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "The Breed Standard",
        description: "A breed standard describes the physical and structural characteristics considered ideal for the breed. Conformation inspection measures how closely a horse's appearance matches these characteristics.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [174] Disqualifying Traits (spec 177) ─────────────────────────────
    {
      element: '[data-tutorial="breed-disqualifying-traits"], [data-tutorial="breed-standard-content"]:not(:has([data-tutorial="breed-disqualifying-traits"]))',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Disqualifying Traits",
        description: "Some traits are disqualifying in conformation competition. A horse may match other parts of the standard, but a disqualifying trait results in a competition score of zero.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [175] Return to Stable (spec 178) ─────────────────────────────────
    {
      element: '[data-tutorial="stable-nav"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Return to the Stable",
        description: "Return to the Stable and open your foal's profile.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Return to the Stable and open ${name}'s profile.`
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

    // ── [176] Select the Foal (spec 179) ──────────────────────────────────
    {
      element: '[data-tutorial="tutorial-foal-stable-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Select Your Foal",
        description: "Open your foal's profile.",
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

    // ── [177] Inspection Message (spec 180) ───────────────────────────────
    {
      element: '[data-tutorial="conformation-panel"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Conformation Inspection",
        description: "Your foal is now eligible for a one-time inspection. This will reveal how closely their physical characteristics match the breed standard.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          const breed = breedName()
          popover.description.textContent = `${name} is now eligible for a one-time inspection. This will reveal how closely their physical characteristics match the ${breed} standard.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [178] Find an Inspection (spec 181) ───────────────────────────────
    {
      element: '[data-tutorial="find-inspection-show"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Find an Inspection",
        description: "Find an inspection show when you're ready.",
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

    // ── [179] Inspection Event info (spec 182) ────────────────────────────
    {
      element: '[data-tutorial="tutorial-venue-card"], [data-tutorial="venue-card-first"], [data-tutorial="inspection-event-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      popover: {
        title: "Inspection Show",
        description: "Inspection is completed once and permanently records the horse's conformation score.",
        showButtons: ["next"],
        onNextClick: () => {
          if (document.querySelector('[data-tutorial="inspection-event-card"]')) ctrl.moveNext()
        },
      },
      onHighlighted: (el?: Element) => {
        injectPulseStyle()
        el?.classList.add("tutorial-pulse")
        const selectingVenue = el?.getAttribute("data-tutorial") !== "inspection-event-card"
        document.querySelector<HTMLElement>(".driver-popover-next-btn")?.style.setProperty("display", selectingVenue ? "none" : "")
        if (selectingVenue && el) {
          const openVenue = () => {
            void waitForElement('[data-tutorial="inspection-event-card"]').then(found => {
              if (found) ctrl.moveTo(180)
            })
          }
          el.addEventListener("click", openVenue, { once: true })
          ;(window as any).__tutorialInspectionVenueCleanup = () => el.removeEventListener("click", openVenue)
        }
      },
      onDeselected: (el?: Element) => {
        ;(window as any).__tutorialInspectionVenueCleanup?.()
        delete (window as any).__tutorialInspectionVenueCleanup
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [180] Complete the Inspection (spec 183) ──────────────────────────
    // Waits for tutorial:conformationInspected dispatched from venue.$venueId.tsx.
    {
      element: '[data-tutorial="tutorial-inspect-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Enter the Inspection",
        description: "Enter your foal in the inspection.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Enter ${name} in the inspection.`
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const onInspected = () => ctrl.moveNext()
        window.addEventListener("tutorial:conformationInspected", onInspected, { once: true })
        ;(el as any).__tutorialInspectCleanup = () => window.removeEventListener("tutorial:conformationInspected", onInspected)
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialInspectCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [181] Return to Stable (spec 184) ─────────────────────────────────
    {
      element: '[data-tutorial="stable-nav"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Return to the Stable",
        description: "Return to the Stable to review the inspection result.",
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

    // ── [182] Select the Foal (spec 185) ──────────────────────────────────
    {
      element: '[data-tutorial="tutorial-foal-stable-card"]',
      waitForElement: 8000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "See the Result",
        description: "Open your foal's profile to see the inspection result.",
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

    // ── [183] Overall Score (spec 186) ────────────────────────────────────
    {
      element: '[data-tutorial="conformation-overall-score"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Inspection Complete",
        description: "This permanent score shows how closely your foal matches the breed standard.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          const breed = breedName()
          popover.description.textContent = `This permanent score shows how closely ${name} matches the ${breed} standard.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [184] Section Results (spec 187) ──────────────────────────────────
    {
      element: '[data-tutorial="conformation-section-scores"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Section Scores",
        description: "The section results show where their conformation most closely matches the standard and where the breeding line could be improved.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [185] Open Genetics tab (spec 188) ────────────────────────────────
    {
      element: '[data-tutorial="genetics-tab"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Conformation Genetics",
        description: "Now let's look at the genes connected with conformation and preferences.",
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

    // ── [186] Open Conformation sub-tab (spec 189) ────────────────────────
    {
      element: '[data-tutorial="genetics-tab-conformation"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Conformation Tab",
        description: "Open the Conformation tab.",
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

    // ── [187] Terrain Loci info (spec 190) ────────────────────────────────
    // Expands every conformation section and pulses the terrain-linked loci
    // cards, which are spread across more than one section.
    {
      element: '[data-tutorial="conformation-accordion"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Terrain Preference",
        description: "These traits must be tested before your foal's terrain preference can be revealed.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `These traits must be tested before ${name}'s terrain preference can be revealed.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        injectPulseStyle()
        focusConformationLoci("terrain")
      },
      onDeselected: () => {
        removePulseStyle()
        unfocusConformationLoci()
      },
    },

    // ── [188] Climate Loci info (spec 191) ────────────────────────────────
    {
      element: '[data-tutorial="conformation-accordion"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Climate Preference",
        description: "These traits must also be tested before your foal's climate preference can be revealed.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `These traits must also be tested before ${name}'s climate preference can be revealed.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
      onHighlighted: () => {
        injectPulseStyle()
        focusConformationLoci("climate")
      },
      onDeselected: () => {
        removePulseStyle()
        unfocusConformationLoci()
      },
    },

    // ── [189] Complete Genetic Test (spec 192) ────────────────────────────
    // Advances when the "Complete Genetic Profile" button disappears, meaning
    // the testCompleteProfile mutation succeeded and the panel re-rendered.
    {
      element: '[data-tutorial="genetics-complete-profile-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Reveal the Full Profile",
        description: "We could test each result individually, but a complete genetic test can reveal everything at once. Let's complete the full test now.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        let finished = false
        const check = () => {
          if (finished || document.querySelector('[data-tutorial="genetics-complete-profile-btn"]')) return
          finished = true
          observer.disconnect()
          ctrl.moveNext()
        }
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        ;(el as any).__tutorialCompleteTestCleanup = () => observer.disconnect()
      },
      onDeselected: (el?: Element) => {
        ;(el as any)?.__tutorialCompleteTestCleanup?.()
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [190] Testing Complete (spec 193) ─────────────────────────────────
    {
      element: '[data-tutorial="conformation-genetics-results"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Testing Complete",
        description: "Your foal's conformation traits and preferences are now available. Knowing these traits can help you make informed decisions as you develop your breeding line.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `${name}'s conformation traits and preferences are now available. Knowing these traits can help you make informed decisions as you develop your breeding line.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [191] Competition Panel info (spec 194) ────────────────────────────
    {
      element: '[data-tutorial="competition-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Weanling Competition",
        description: "Your foal is old enough to begin competing in conformation events.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `${name} is old enough to begin competing in conformation events.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [192] Choose Discipline (spec 195) ────────────────────────────────
    // Advances when discipline-confirm button disappears (discipline set + panel re-renders).
    {
      element: '[data-tutorial="competition-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Choose a Discipline",
        description: "Select Weanling Halter as your competition discipline.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Select Weanling Halter as ${name}'s competition discipline.`
        },
      },
      onHighlighted: () => {
        injectPulseStyle()
        document.querySelector('[data-tutorial="discipline-select"]')?.classList.add("tutorial-pulse")
        document.querySelector('[data-tutorial="discipline-confirm"]')?.classList.add("tutorial-pulse")
        let finished = false
        const check = () => {
          if (finished || document.querySelector('[data-tutorial="discipline-confirm"]')) return
          finished = true
          observer.disconnect()
          ;(window as any).__tutorialDisciplineSetCleanup?.()
          ctrl.moveNext()
        }
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        ;(window as any).__tutorialDisciplineSetCleanup = () => {
          observer.disconnect()
          document.querySelector('[data-tutorial="discipline-select"]')?.classList.remove("tutorial-pulse")
          document.querySelector('[data-tutorial="discipline-confirm"]')?.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: () => {
        ;(window as any).__tutorialDisciplineSetCleanup?.()
        delete (window as any).__tutorialDisciplineSetCleanup
      },
    },

    // ── [193] Prepare for Competition (spec 196, unguided) ─────────────────
    // Shows an explanatory popover, then hides the driver while the player
    // gathers requirements. Advances when view-venues-btn becomes enabled.
    // No `element`: its home is the foal's own profile, but the player may be
    // mid-errand on the shop/vet/town when the tutorial re-initializes (e.g.
    // after a reload) — an element target would make driver.js fail to find it
    // there and force a bogus "tutorial couldn't continue" recovery. Instead,
    // onHighlighted itself checks which case it's in.
    {
      disableActiveInteraction: false,
      popover: {
        title: "Prepare for the Show",
        description: "Before they can compete, they need the required equipment and current health certificates. Prepare them for the show, then return here when every requirement is met.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Before ${name} can compete, they need the required equipment and current health certificates. Prepare them for the show, then return here when every requirement is met.`
        },
        onNextClick: () => armPrepWatcher(ctrl),
      },
      onHighlighted: () => {
        // Resuming away from the foal's profile (e.g. reload while at the shop) —
        // the player already saw and dismissed this popover before; re-arm
        // silently instead of showing it again over an unrelated page.
        if (!document.querySelector('[data-tutorial="competition-panel"]')) armPrepWatcher(ctrl)
      },
      onDeselected: () => {
        ;(window as any).__tutorialPrepCleanup?.()
        delete (window as any).__tutorialPrepCleanup
      },
    },

    // ── [194] Requirements Met (spec 197) ─────────────────────────────────
    {
      element: '[data-tutorial="bonding-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Ready to Show",
        description: "Your foal has everything required to enter a Weanling Halter competition. Now choose a suitable venue.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `${name} has everything required to enter a Weanling Halter competition. Now choose a suitable venue.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [195] View Venues (spec 198) ──────────────────────────────────────
    {
      element: '[data-tutorial="view-venues-btn"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Find a Venue",
        description: "Use your foal's terrain and climate preferences to choose a venue offering Weanling Halter.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Use ${name}'s terrain and climate preferences to choose a venue offering Weanling Halter.`
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

    // ── [196] Compare Venues (spec 199) ───────────────────────────────────
    {
      popover: {
        title: "Choose the Best Match",
        description: "Compare each venue's terrain and climate with your foal's preferences, then visit a suitable venue.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Compare each venue's terrain and climate with ${name}'s preferences, then visit a suitable venue.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [197] Expand discipline section (spec 200) ─────────────────────────
    {
      element: '[data-tutorial="tutorial-discipline-section-btn"]',
      waitForElement: 8000,
      popover: {
        title: "Conformation Competition",
        description: "Select the open Weanling Halter competition.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const handler = (event: MouseEvent) => {
          if (!(event.target instanceof Element) || !event.target.closest('[data-tutorial="tutorial-discipline-section-btn"]')) return
          document.removeEventListener("click", handler)
          setTimeout(() => ctrl.moveNext(), 0)
        }
        document.addEventListener("click", handler)
        ;(el as any).__tutorialDisciplineExpandCleanup = () => document.removeEventListener("click", handler)
      },
      onDeselected: (el?: Element) => {
        removePulseStyle()
        ;(el as any)?.__tutorialDisciplineExpandCleanup?.()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [198] Explain Scoring (spec 201) ──────────────────────────────────
    {
      element: '[data-tutorial="tutorial-compete-section"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Halter Scoring",
        description: "The inspection score forms the basis of the result. Personality and the horse's match with the venue's terrain and climate can modify the final score. A disqualifying trait always results in a score of zero.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [199] Enter the Show (spec 202) ───────────────────────────────────
    // Uses tutorial.compete mutation (same as mare competition flow).
    // After success, the venue page auto-navigates to the foal's profile and
    // dispatches tutorial:tierAdvanced.
    {
      // Resuming mid-flow (reload, or right after entering) can land here with
      // the discipline section collapsed again — its open/closed state isn't
      // persisted. Expand it first, same as step [198], instead of failing to
      // find a button that's simply hidden.
      element: () => {
        const btn = document.querySelector<HTMLElement>('[data-tutorial="tutorial-compete-btn"]')
        if (btn) return btn
        const sectionBtn = document.querySelector<HTMLElement>('[data-tutorial="tutorial-discipline-section-btn"]')
        if (sectionBtn?.dataset.expanded === "false") sectionBtn.click()
        return document.querySelector<HTMLElement>('[data-tutorial="tutorial-compete-btn"]') ?? undefined
      },
      waitForElement: 5000,
      disableActiveInteraction: false,
      popover: {
        title: "Enter the Show",
        description: "Enter your foal in the competition.",
        showButtons: [],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Enter ${name} in the competition.`
        },
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        let advanced = false
        const onEntered = (event: Event) => {
          const detail = (event as CustomEvent<{ disciplineName: string }>).detail
          capturedTierName = ""
          if (detail?.disciplineName) capturedTierName = detail.disciplineName
          if (!advanced) {
            advanced = true
            ;(window as any).__tutorialFoalCompeteCleanup?.()
            ctrl.moveNext()
          }
        }
        window.addEventListener("tutorial:tierAdvanced" as "click", onEntered)
        ;(window as any).__tutorialFoalCompeteCleanup = () => window.removeEventListener("tutorial:tierAdvanced" as "click", onEntered)
      },
      onDeselected: (el?: Element) => {
        ;(window as any).__tutorialFoalCompeteCleanup?.()
        delete (window as any).__tutorialFoalCompeteCleanup
        removePulseStyle()
        el?.classList.remove("tutorial-pulse")
      },
    },

    // ── [200] Current Tier (spec 204) ─────────────────────────────────────
    // `tutorial-compete-tier` (the mare's/foal's tier readout on the venue page)
    // doesn't exist here — this step runs back on the foal's own profile after
    // the auto-navigation out of the venue, where the equivalent element is
    // `tutorial-compete-tier-info` in the Competition panel.
    {
      element: '[data-tutorial="tutorial-compete-tier-info"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "Competition Tier",
        description: "Your foal begins at the Rookie tier in Weanling Halter.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          const tier = document.querySelector('[data-tutorial="tutorial-compete-tier-info"] .text-sm')?.textContent?.trim()
          if (tier) capturedTierName = tier
          popover.description.textContent = `${name} begins at the ${capturedTierName || "Rookie"} tier in Weanling Halter.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [201] Progress and Points (spec 205) ──────────────────────────────
    // Falls back to the whole Competition panel if the progress bar isn't
    // rendered (e.g. this tier has no configured advancement threshold),
    // rather than failing to find an unrelated Bonding-panel element.
    {
      element: () =>
        document.querySelector<HTMLElement>('[data-tutorial="tutorial-tier-progress"]')
        ?? document.querySelector<HTMLElement>('[data-tutorial="competition-panel"]')
        ?? undefined,
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Tier Progress",
        description: "Competition results award points toward the next tier. Stronger results produce faster progress.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [202] Open Competition History (spec 206) ─────────────────────────
    {
      element: '[data-tutorial="competition-history-tab"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Competition History",
        description: "Open Competition History to review the result.",
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

    // ── [203] Recorded Result (spec 207) ──────────────────────────────────
    {
      element: '[data-tutorial="competition-result-first"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Competition History",
        description: "The final score reflects your foal's conformation, personality, and suitability for the venue.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `The final score reflects ${name}'s conformation, personality, and suitability for the venue.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [204] Bonding Panel (spec 208) ────────────────────────────────────
    {
      element: '[data-tutorial="bonding-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Bonding Activities",
        description: "Young horses cannot begin formal training yet, but bonding activities can gently influence their developing personality.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [205] Personality Shifts (spec 209) ───────────────────────────────
    {
      element: '[data-tutorial="bonding-panel"]',
      waitForElement: 3000,
      disableActiveInteraction: true,
      popover: {
        title: "Personality Shifts",
        description: "Each personality trait can be shifted once. You may complete one bonding activity per cycle, and these activities never change the horse's innate trait.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [206] Open Directories (spec 210) ─────────────────────────────────
    {
      element: '[data-tutorial="directory-nav"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Personality Directory",
        description: "The Personality Directory can help you decide whether a shift suits the temperament you want.",
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

    // ── [207] Personality Directory (spec 211) ────────────────────────────
    {
      element: '[data-tutorial="personality-directory-card"]',
      waitForElement: 5000,
      disableActiveInteraction: false,
      advanceOnClick: true,
      popover: {
        title: "Open the Directory",
        description: "Open the Personality Directory.",
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

    // ── [208] Trait Reference (spec 212) ──────────────────────────────────
    {
      popover: {
        title: "Personality Directory",
        description: "This directory explains each personality trait and its possible labels. Use it to compare how different temperaments may affect a horse.",
        showButtons: ["next"],
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [209] Explore and Return (spec 213, unguided) ─────────────────────
    // Driver hides. stable-nav pulses. Advances when the foal's profile loads
    // (detected by [data-tutorial="animal-profile"] appearing in the DOM).
    {
      popover: { title: "", description: "", showButtons: [] },
      onHighlighted: () => {
        injectUnguidedStyle()
        injectPulseStyle()
        const objective = document.createElement("div")
        objective.id = "tutorial-return-objective"
        objective.textContent = `Return to ${foalName()}`
        objective.className = "fixed right-4 top-20 z-[10000] rounded-md border border-primary/40 bg-background/95 px-3 py-2 text-sm font-semibold text-foreground shadow-lg"
        document.body.appendChild(objective)
        const pulse = () => {
          document.querySelectorAll('[data-tutorial="stable-nav"]').forEach(el => el.classList.add("tutorial-pulse"))
        }
        pulse()
        const pulseInterval = setInterval(pulse, 500)
        let finished = false
        const check = () => {
          if (finished || !document.querySelector('[data-tutorial="animal-profile"]')) return
          finished = true
          observer.disconnect()
          ;(window as any).__tutorialExploreReturnCleanup?.()
          ctrl.moveNext()
        }
        const observer = new MutationObserver(check)
        observer.observe(document.body, { childList: true, subtree: true })
        ;(window as any).__tutorialExploreReturnCleanup = () => {
          clearInterval(pulseInterval)
          observer.disconnect()
          objective.remove()
          document.querySelectorAll('[data-tutorial="stable-nav"]').forEach(el => el.classList.remove("tutorial-pulse"))
          removeUnguidedStyle()
          removePulseStyle()
        }
      },
      onDeselected: () => {
        ;(window as any).__tutorialExploreReturnCleanup?.()
        delete (window as any).__tutorialExploreReturnCleanup
      },
    },

    // ── [210] Bonding is Optional (spec 214) ──────────────────────────────
    {
      element: '[data-tutorial="bonding-panel"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Your Choice",
        description: "You do not need to shift your foal's personality to continue. Use bonding activities only when a small change supports the temperament you want.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `You do not need to shift ${name}'s personality to continue. Use bonding activities only when a small change supports the temperament you want.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [211] Grow to Youngstock (spec 215, unguided) ─────────────────────
    // Shows brief popover, then hides the driver until twelve months.
    // No `element` for the same reason as [194] — the player may be away from
    // the foal's profile (competing, exploring directories) when this
    // re-initializes, and an element target would wrongly force a recovery.
    {
      disableActiveInteraction: false,
      popover: {
        title: "The Youngstock Stage",
        description: "Continue caring for your foal and advance their age to twelve months. You may explore, compete, or use bonding activities along the way.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `Continue caring for ${name} and advance their age to twelve months. You may explore, compete, or use bonding activities along the way.`
        },
        onNextClick: () => armYoungstockWatcher(ctrl),
      },
      onHighlighted: () => {
        if (!document.querySelector('[data-tutorial="animal-header"]')) armYoungstockWatcher(ctrl)
      },
      onDeselected: () => {
        ;(window as any).__tutorialYoungstockCleanup?.()
        delete (window as any).__tutorialYoungstockCleanup
      },
    },

    // ── [212] Youngstock Reached (spec 216) ───────────────────────────────
    {
      element: '[data-tutorial="animal-header"]',
      waitForElement: 8000,
      disableActiveInteraction: true,
      popover: {
        title: "A New Chapter",
        description: "Your foal has reached the Youngstock stage. Training and new competition opportunities will continue to open as they mature.",
        showButtons: ["next"],
        onPopoverRender: (popover: { description: HTMLElement }) => {
          const name = foalName()
          popover.description.textContent = `${name} has reached the Youngstock stage. Training and new competition opportunities will continue to open as they mature.`
        },
        onNextClick: () => ctrl.moveNext(),
      },
    },

    // ── [213] Tutorial Complete (spec 217) ────────────────────────────────
    {
      popover: {
        title: "Your Stable, Your Direction",
        description: "You've raised your first horse, learned how to evaluate them, and begun developing your breeding line. From here, the direction of your stable is yours.",
        showButtons: ["next"],
        nextBtnText: "Finish Tutorial",
        onNextClick: async () => {
          await callbacks.completeStep("tutorial_complete")
          ctrl.moveNext()
        },
      },
    },

  ]
}
