// Competition entry requirements for the unguided "Prepare for the Show" step.
//
// That step pulses only the controls that still have work behind them, and those
// controls live on pages — the shop, the vet — where the animal's Competition
// panel isn't mounted. The panel publishes here whenever it renders, so the
// tutorial watcher can read the last known state from anywhere.
export type ShowPrepRequirements = { equipmentMet: boolean; certsMet: boolean }

let requirements: ShowPrepRequirements = { equipmentMet: false, certsMet: false }

export function setShowPrepRequirements(next: ShowPrepRequirements) {
  requirements = next
}

export function getShowPrepRequirements(): ShowPrepRequirements {
  return requirements
}
