export type TutorialCallbacks = {
  grantGold: (amount: number) => Promise<void>
  grantPremium: () => Promise<void>
  completeStep: (stepKey: string) => Promise<void>
}

export type TutorialCtrl = {
  moveNext: () => void
  moveTo: (index: number) => void
  isLastStep: () => boolean
  destroy: () => void
  refresh: () => void
  reDrive: () => void
}
