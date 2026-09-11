export type TutorialCallbacks = {
  grantGold: () => Promise<void>
  grantPremium: () => Promise<void>
  completeStep: (stepKey: string) => Promise<void>
}

export type TutorialCtrl = {
  moveNext: () => void
  isLastStep: () => boolean
  destroy: () => void
  refresh: () => void
}
