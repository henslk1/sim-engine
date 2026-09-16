import { driver } from "driver.js"
import type { TutorialCallbacks } from "./types"
import { shopSteps } from "./steps/shop"
import { stableSteps } from "./steps/stable"
import { profileSteps } from "./steps/profile"
import { trainingSteps } from "./steps/training"
import { competitionSteps } from "./steps/competition"
import { devPauseStep } from "./steps/dev-pause"
import { getTutorialPolicy, TUTORIAL_STEPS } from "@sim-engine/trpc/tutorial-policy"
import { getTutorialAccess, setTutorialAccess, saveTutorialStep, prepareTutorialControl } from "./access"
import { waitForElement } from "./utils/wait-for-element"

let activeDriver: ReturnType<typeof driver> | null = null
let generation = 0

export function isTourRunning() { return getTutorialAccess().running }
export function setTourRunning(running: boolean) { setTutorialAccess({ running, ready: false }) }

export function destroyActiveTour() {
  generation++
  setTutorialAccess({ running: false, ready: false })
  const previous = activeDriver
  activeDriver = null
  previous?.destroy()
}

// Restore transient UI state lost on refresh/dashboard recovery. These clicks
// only open panels or select tabs/intensities; they never perform game actions.
async function restoreStep(step: number) {
  const click = async (selector: string) => {
    if (!await waitForElement(selector)) throw new Error("The tutorial control could not be found.")
    prepareTutorialControl(selector)
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  if (step === 4) await click('[data-tutorial="shop-animals-tab"]')
  if ([30, 31, 32, 34].includes(step)) await click('[data-tutorial="training-target-intense"]')
  if (step === 64) await click('[data-tutorial="add-second-discipline"]')
  if ([66, 67, 68, 77, 78, 79].includes(step)) await click('[data-tutorial="discipline-tab-2"]')
  if ([74, 75].includes(step)) await click('[data-tutorial="equip-action"]')
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
  const steps = [
    ...shopSteps(ctrl, guardedCallbacks),
    ...stableSteps(ctrl, guardedCallbacks),
    ...profileSteps(ctrl, guardedCallbacks),
    ...trainingSteps(ctrl, guardedCallbacks),
    ...competitionSteps(ctrl, guardedCallbacks),
    devPauseStep(ctrl, devPausedRef),
  ].map((step, index) => ({
    ...step,
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
      step.onHighlighted?.(...args)
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
      if (restoring) await restoreStep(index)
      if (!current()) return
      driverObj.drive(index)
    } catch (error) { recover(error) }
  }
  void moveTo(startAtIndex, true)
}
