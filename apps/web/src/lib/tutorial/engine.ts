import { driver } from "driver.js"
import type { TutorialCallbacks } from "./types"
import { shopSteps } from "./steps/shop"
import { stableSteps } from "./steps/stable"
import { profileSteps } from "./steps/profile"
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
    isLastStep: () => false,
    destroy: () => {},
    refresh: () => {},
  }

  const steps = [
    ...shopSteps(ctrl, callbacks),       // 0–5
    ...stableSteps(ctrl, callbacks),     // 6–10
    ...profileSteps(ctrl, callbacks),    // 11–20
    devPauseStep(ctrl, devPausedRef),    // 21
  ]

  const driverObj = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.55,
    smoothScroll: true,
    allowClose: false,
    onDestroyStarted: () => {
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
  ctrl.isLastStep = () => driverObj.isLastStep()
  ctrl.destroy = () => driverObj.destroy()
  ctrl.refresh = () => driverObj.refresh()

  _activeDriver = driverObj
  _tourRunning = true
  localStorage.setItem("tutorial_step", String(startAtIndex))
  driverObj.drive(startAtIndex)
}
