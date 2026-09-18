import { driver } from "driver.js"
import type { TutorialCallbacks } from "./types"
import { shopSteps } from "./steps/shop"
import { stableSteps } from "./steps/stable"
import { profileSteps } from "./steps/profile"
import { trainingSteps } from "./steps/training"
import { competitionSteps } from "./steps/competition"
import { venueSteps } from "./steps/venues"
import { devPauseStep } from "./steps/dev-pause"
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
}

export function startTutorial(callbacks: TutorialCallbacks, startAtIndex: number, _onComplete?: () => void) {
  destroyActiveTour()
  const thisGeneration = generation
  const current = () => generation === thisGeneration && isTourRunning()
  const devPausedRef = { value: false }
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
    devPauseStep(ctrl, devPausedRef),
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

  async function moveTo(index: number, restoring = false) {
    if (!current() || moving) return
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
      // Driver's smooth scroll and late query rendering can move the target
      // after its overlay hole is measured. Recalculate once the animation ends.
      setTimeout(() => {
        if (current() && requestedStep === index) driverObj.refresh()
      }, 400)
    } catch (error) { recover(error) }
  }
  void moveTo(startAtIndex, true)
}
