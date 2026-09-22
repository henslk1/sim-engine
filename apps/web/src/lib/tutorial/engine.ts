import { driver } from "driver.js"
import type { TutorialCallbacks } from "./types"
import { shopSteps } from "./steps/shop"
import { stableSteps } from "./steps/stable"
import { profileSteps } from "./steps/profile"
import { trainingSteps } from "./steps/training"
import { competitionSteps } from "./steps/competition"
import { venueSteps } from "./steps/venues"
import { foalSteps } from "./steps/foal"
import { getTutorialPolicy, TUTORIAL_STEPS } from "@sim-engine/trpc/tutorial-policy"
import { getTutorialAccess, setTutorialAccess, saveTutorialStep, saveTutorialRunning, prepareTutorialControl } from "./access"
import { waitForElement } from "./utils/wait-for-element"

let activeDriver: ReturnType<typeof driver> | null = null
let generation = 0

export function isTourRunning() { return getTutorialAccess().running }
export function setTourRunning(running: boolean) {
  saveTutorialRunning(running)
  setTutorialAccess({ running, ready: false, venueChoiceAcknowledged: false })
}

export function destroyActiveTour() {
  generation++
  setTourRunning(false)
  const previous = activeDriver
  activeDriver = null
  previous?.destroy()
}

// Restore transient UI state lost on refresh/dashboard recovery. These clicks
// only open panels or select tabs/intensities; they never perform game actions.
async function restoreStep(step: number, current: () => boolean) {
  const click = async (selector: string) => {
    if (!await waitForElement(selector)) throw new Error("The tutorial control could not be found.")
    if (!current()) return
    prepareTutorialControl(selector)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  if (step === 4) await click('[data-tutorial="shop-animals-tab"]')
  if ([30, 31, 32, 34].includes(step)) await click('[data-tutorial="training-target-intense"]')
  if (step === 64) await click('[data-tutorial="add-second-discipline"]')
  if ([66, 67, 68, 77, 78, 79, 80].includes(step)) await click('[data-tutorial="discipline-tab-2"]')
  if ([86, 87, 88, 89].includes(step)) await click('[data-tutorial="tutorial-discipline-section-btn"]')
  if ([74, 75].includes(step)) await click('[data-tutorial="equip-action"]')
  if ([91, 92].includes(step)) await click('[data-tutorial="competition-history-tab"]')
  if ([93, 94, 95].includes(step)) await click('[data-tutorial="discipline-tab-2"]')
  if (step === 105) await click('[data-tutorial="comprehensive-exam-option"]')
  if (step >= 118 && step <= 126) await click('[data-tutorial="genetics-tab"]')
  if (step >= 123 && step <= 126) await click('[data-tutorial="genetics-tab-health"]')
  if (step >= 185 && step <= 190) await click('[data-tutorial="genetics-tab"]')
  if (step >= 186 && step <= 190) await click('[data-tutorial="genetics-tab-conformation"]')
  if (step >= 202 && step <= 203) await click('[data-tutorial="competition-history-tab"]')
}

export function startTutorial(callbacks: TutorialCallbacks, startAtIndex: number, _onComplete?: () => void) {
  destroyActiveTour()
  const thisGeneration = generation
  const current = () => generation === thisGeneration && isTourRunning()
  let moving = false
  let requestedStep = startAtIndex
  const recover = (error?: unknown) => {
    if (!current()) return
    destroyActiveTour()
    callbacks.recover(error)
  }
  const ctrl = {
    moveNext: () => { void moveTo(requestedStep + 1) },
    moveTo: (index: number) => { void moveTo(index) },
    isLastStep: () => requestedStep === TUTORIAL_STEPS.length - 1,
    destroy: () => recover(),
    refresh: () => { if (current()) activeDriver?.refresh() },
  }
  const guardedCallbacks: TutorialCallbacks = {
    ...callbacks,
    completeStep: key => current() ? callbacks.completeStep(key) : Promise.resolve(),
    grantGold: amount => current() ? callbacks.grantGold(amount) : Promise.resolve(),
    grantPremium: () => current() ? callbacks.grantPremium() : Promise.resolve(),
  }
  const clickCleanups = new Map<number, () => void>()
  const steps = [
    ...shopSteps(ctrl, guardedCallbacks),
    ...stableSteps(ctrl, guardedCallbacks),
    ...profileSteps(ctrl, guardedCallbacks),
    ...trainingSteps(ctrl, guardedCallbacks),
    ...competitionSteps(ctrl, guardedCallbacks),
    ...venueSteps(ctrl, guardedCallbacks),
    ...foalSteps(ctrl, guardedCallbacks),
  ].map((step, index) => ({
    ...step,
    // Handle action clicks on the target itself. Some game dialogs stop click
    // propagation, so Driver.js's document-level advanceOnClick never sees them.
    advanceOnClick: false,
    popover: { ...step.popover, onNextClick: step.popover?.onNextClick ?? ctrl.moveNext },
    onHighlightStarted: (element: Element | undefined) => {
      if (!current()) return
      if (step.element && !element) { queueMicrotask(() => recover(new Error("The tutorial panel could not be loaded."))); return }
      saveTutorialStep(index)
    },
    onHighlighted: (...args: Parameters<NonNullable<typeof step.onHighlighted>>) => {
      if (!current()) return
      moving = false
      // Driver only fires onDeselected when the active element actually changes,
      // so consecutive steps that spotlight the same element never get to clean
      // up after themselves and their pulses bleed into the next step. Clear the
      // class here — every step that wants one re-applies it in its own
      // onHighlighted below, which runs at the end of this wrapper.
      document.querySelectorAll(".tutorial-pulse").forEach(el => el.classList.remove("tutorial-pulse"))
      setTutorialAccess({ step: index, ready: true })
      if (step.advanceOnClick && args[0]) {
        const element = args[0]
        const advance = () => setTimeout(() => { if (current()) ctrl.moveNext() }, 0)
        element.addEventListener("click", advance)
        clickCleanups.set(index, () => element.removeEventListener("click", advance))
      }
      step.onHighlighted?.(...args)
    },
    onDeselected: (...args: Parameters<NonNullable<typeof step.onDeselected>>) => {
      clickCleanups.get(index)?.()
      clickCleanups.delete(index)
      step.onDeselected?.(...args)
    },
  }))
  const driverObj = driver({
    showProgress: true, animate: true, duration: 300, overlayOpacity: 0.55,
    smoothScroll: true, allowClose: false, allowKeyboardControl: false,
    showButtons: ["next"], stagePadding: 4,
    onDestroyStarted: () => recover(),
    steps,
  })
  activeDriver = driverObj
  setTourRunning(true)

  // Driver measures the target once, then holds that exact node, and nothing it
  // does afterwards re-checks that measurement. Two things break it:
  //   - a late query resolving moves or lays out the target after the popover was
  //     positioned, which for a zero-sized box clamps it to the top-left corner;
  //   - a re-render REPLACES the target, leaving Driver holding the detached
  //     original, so the highlight, its pulse and its advanceOnClick handler all
  //     point at a node no longer in the document.
  // refresh() re-reads the cached element, so it fixes the first but not the
  // second — a replaced target has to be re-driven to re-resolve the selector.
  // The refreshes are unconditional and spread over a few seconds rather than
  // tied to a predicted settle time: Driver's own waitForElement means the
  // transition can start well after drive() returns, so any single delay we pick
  // is guesswork. refresh() is cheap and idempotent, and repositioning from an
  // unchanged box is a no-op, so repeating it costs nothing and cannot land late.
  let settleCleanup: (() => void) | null = null
  function settleHighlight(index: number) {
    settleCleanup?.()
    const expectsElement = !!steps[index]?.element
    let redrives = 0
    let redroveAt = 0
    const startedAt = Date.now()
    const stop = () => { clearInterval(timer); settleCleanup = null }
    const timer = setInterval(() => {
      if (!current() || requestedStep !== index) return stop()
      const el = driverObj.getActiveElement()
      if (expectsElement && el && !document.contains(el)) {
        if (redrives >= 3) return stop()
        redrives += 1
        redroveAt = Date.now()
        driverObj.drive(index)
        return
      }
      // Skip the tick right after a re-drive so the new transition can start.
      if (Date.now() - redroveAt > 400) driverObj.refresh()
      if (Date.now() - startedAt > 3000) stop()
    }, 400)
    settleCleanup = stop
  }

  async function moveTo(index: number, restoring = false) {
    if (!current() || moving) return
    if (index === TUTORIAL_STEPS.length && requestedStep === TUTORIAL_STEPS.length - 1) {
      setTutorialAccess({ restricted: false })
      destroyActiveTour()
      return
    }
    if (!getTutorialPolicy(index)) { recover(); return }
    moving = true
    requestedStep = index
    // Routes can change in the same click as advancement. Controls wait for
    // server acknowledgement and the new highlight.
    setTutorialAccess({ step: index, ready: false })
    try {
      await new Promise(resolve => setTimeout(resolve, 0))
      if (!current()) return
      await callbacks.setStep(index)
      if (!current()) return
      saveTutorialStep(index)
      if (restoring) await restoreStep(index, current)
      if (!current()) return
      driverObj.drive(index)
      settleHighlight(index)
    } catch (error) { recover(error) }
  }
  void moveTo(startAtIndex, true)
}
