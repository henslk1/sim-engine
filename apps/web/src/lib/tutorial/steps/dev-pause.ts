import type { DriveStep } from "driver.js"
import type { TutorialCtrl } from "../types"

// TODO: remove before launch
export function devPauseStep(ctrl: TutorialCtrl, devPausedRef: { value: boolean }): DriveStep {
  return {
    popover: {
      title: "Dev Pause",
      description: "Phase complete. Verify state, then continue.",
      showButtons: ["next"],
      onNextClick: () => { devPausedRef.value = true; ctrl.moveNext() },
    },
  }
}
