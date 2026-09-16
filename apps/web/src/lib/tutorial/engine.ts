import { driver } from "driver.js"
import type { TutorialCallbacks } from "./types"
import { shopSteps } from "./steps/shop"
import { stableSteps } from "./steps/stable"
import { profileSteps } from "./steps/profile"
import { trainingSteps } from "./steps/training"
import { competitionSteps } from "./steps/competition"
import { devPauseStep } from "./steps/dev-pause"

// Module-level flag: true only while Driver.js is actively running in this page session.
// Resets to false on every full page load (module re-evaluates) — never goes stale.
// setTourRunning(true) is called by beginTutorial BEFORE navigation so beforeLoad can
// allow /shop during the 600 ms gap before driverObj.drive() is called.
let _tourRunning = false
let _activeDriver: ReturnType<typeof driver> | null = null

export function isTourRunning() { return _tourRunning }
export function setTourRunning(running: boolean) { _tourRunning = running }

// Tears down the active driver instance — removes overlay, popover, and all event listeners.
// Call this from dev buttons so driver.js stops intercepting pointer events before acting.
export function destroyActiveTour() {
  _activeDriver?.destroy()
  _activeDriver = null
  _tourRunning = false
}

export function startTutorial(
  callbacks: TutorialCallbacks,
  startAtIndex: number,
  onComplete?: () => void,
) {
  const devPausedRef = { value: false }

  // Use a controller ref so steps can call moveNext/refresh without a circular reference.
  // Properties are stubs until wired up after driver() is created.
  const ctrl = {
    moveNext: () => {},
    moveTo: (_index: number) => {},
    isLastStep: () => false,
    destroy: () => {},
    refresh: () => {},
  }

  const steps = [
    ...shopSteps(ctrl, callbacks),          // 0–4
    ...stableSteps(ctrl, callbacks),        // 5–9
    ...profileSteps(ctrl, callbacks),       // 10–19
    ...trainingSteps(ctrl, callbacks),      // 20–55
    ...competitionSteps(ctrl, callbacks),   // 56–78
    devPauseStep(ctrl, devPausedRef),       // 79
  ]

  // Save the live step index to localStorage on page unload so a refresh resumes
  // from the exact step, not just the last checkpoint that called ctrl.moveNext().
  const saveStepOnUnload = () => {
    const idx = _activeDriver?.getActiveIndex() ?? null
    if (idx !== null) localStorage.setItem("tutorial_step", String(idx))
  }
  window.addEventListener("beforeunload", saveStepOnUnload)

  const driverObj = driver({
    showProgress: true,
    animate: true,
    duration: 300,
    overlayOpacity: 0.55,
    smoothScroll: true,
    allowClose: false,
    showButtons: ["next"],
    stagePadding: 4,
    onDestroyStarted: () => {
      window.removeEventListener("beforeunload", saveStepOnUnload)
      _tourRunning = false
      if (ctrl.isLastStep() && !devPausedRef.value) {
        ctrl.destroy()
        localStorage.removeItem("tutorial_step")
        onComplete?.()
      }
      devPausedRef.value = false
    },
    steps,
  })

  ctrl.moveNext = () => {
    driverObj.moveNext()
    const next = driverObj.getActiveIndex()
    if (next !== null) localStorage.setItem("tutorial_step", String(next))
  }
  ctrl.moveTo = (index: number) => {
    driverObj.drive(index)
    localStorage.setItem("tutorial_step", String(index))
  }
  ctrl.isLastStep = () => driverObj.isLastStep()
  ctrl.destroy = () => driverObj.destroy()
  ctrl.refresh = () => driverObj.refresh()

  _activeDriver = driverObj
  _tourRunning = true
  localStorage.setItem("tutorial_step", String(startAtIndex))
  driverObj.drive(startAtIndex)
}
