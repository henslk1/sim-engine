// Driver.js indexes are zero based. Every step grants its own routes, controls,
// and mutations; a spotlight is explanatory and does not itself grant access.
export type TutorialPage = "dashboard" | "shop" | "stable" | "mare" | "vet" | "town" | "venues" | "venue"
type StepPolicy = {
  page: TutorialPage
  destinations?: TutorialPage[]
  controls?: string[]
  mutations?: string[]
  checkpoint?: string
  gold?: number
}
const control = (...names: string[]) => names.map(name => `[data-tutorial="${name}"]`)
const trainingControls = ['[data-tutorial="training-panel"] [data-energy-cost]', '[data-tutorial-train="true"] > button']
export const TUTORIAL_CERTIFICATES = ["Coggins Certificate", "Vaccination Certificate"]
export const TUTORIAL_STEPS: readonly StepPolicy[] = [
  { page: "dashboard", destinations: ["shop"], controls: control("shop-nav") }, // 0
  { page: "shop" },
  { page: "shop", gold: 300 },
  { page: "shop", controls: control("shop-animals-tab") },
  { page: "shop", controls: control("shop-animal-buy"), mutations: ["tutorial.buyFemale"], checkpoint: "step_shop" },
  { page: "shop", destinations: ["stable"], controls: control("stable-nav") }, // 5
  { page: "stable" },
  { page: "stable" },
  { page: "stable" },
  { page: "stable", destinations: ["mare"], controls: ['[data-tutorial="tutorial-mare-stable-card"] a'], checkpoint: "step_purchased" },
  { page: "mare" }, // 10: profile introduction
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", checkpoint: "step_mare_profile" },
  { page: "mare" }, // 20: training introduction
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("care-groom"), mutations: ["care.perform"] },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("training-target-intense") },
  { page: "mare", controls: control("training-target-train"), mutations: ["training.perform"] }, // 30
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("training-target-intense") },
  { page: "mare", controls: control("training-target-train"), mutations: ["training.perform"] },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("daily-care-perform", "care-groom"), mutations: ["care.perform"] },
  { page: "mare", controls: control("training-light-tier", "training-near-cap-train"), mutations: ["training.perform"] },
  { page: "mare" },
  { page: "mare" }, // 40
  { page: "mare", gold: 100 },
  { page: "mare", controls: control("ltc-perform"), mutations: ["care.performLtc"] },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("advance-age"), mutations: ["animal.advanceAge"], checkpoint: "step_training_intro" },
  { page: "mare", controls: trainingControls, mutations: ["training.perform"], checkpoint: "step_training_free" },
  { page: "mare" }, // 50
  { page: "mare", controls: control("daily-care-perform", "care-groom"), mutations: ["care.perform"], checkpoint: "step_care_day2" },
  { page: "mare", controls: trainingControls, mutations: ["training.perform"], checkpoint: "step_training_guarded" },
  { page: "mare", controls: control("advance-age"), mutations: ["animal.advanceAge"], checkpoint: "step_day2_retire" },
  { page: "mare", checkpoint: "step_training_complete" },
  { page: "mare", checkpoint: "step_competition_transition" },
  { page: "mare" },
  { page: "mare", destinations: ["vet"], controls: control("book-cert-testing") },
  { page: "vet", gold: 100 },
  { page: "vet", controls: control("cert-issue-btn"), mutations: ["vet.issueCert"], checkpoint: "step_health_certs" },
  { page: "vet", destinations: ["mare"], controls: control("vet-back-link") }, // 60
  { page: "mare" },
  { page: "mare" },
  { page: "mare", controls: control("add-second-discipline") },
  { page: "mare", controls: control("discipline-select", "discipline-confirm"), mutations: ["animal.setSecondaryDiscipline"] },
  { page: "mare", controls: control("discipline-tab-2") },
  { page: "mare" },
  { page: "mare" },
  { page: "mare", destinations: ["town"], controls: control("town-nav") },
  { page: "town", destinations: ["shop"], controls: control("town-shop-card") },
  { page: "shop", controls: control("tutorial-shop-buy"), mutations: ["inventory.buy"] }, // 70
  { page: "shop", destinations: ["stable"], controls: control("stable-nav") },
  { page: "stable", destinations: ["mare"], controls: ['[data-tutorial="tutorial-mare-stable-card"] a'] },
  { page: "mare", controls: control("equip-action") },
  { page: "mare", controls: ['[data-tutorial="tutorial-equip-item"] button'], mutations: ["inventory.equip"] },
  { page: "mare", controls: control("equip-modal-close") },
  { page: "mare", controls: control("discipline-tab-2") },
  { page: "mare" },
  { page: "mare" },
  { page: "mare" }, // 79: climate preference info
  { page: "mare", destinations: ["venues"], controls: control("view-venues-btn") }, // 80: navigate to venues
  { page: "venues" }, // 81: first venue card — climate/terrain spotlight
  { page: "venues" }, // 82: first venue card — discipline area
  { page: "venues" }, // 83: discipline filter
  { page: "venues", destinations: ["venue"], controls: control("tutorial-venue-card", "venue-card-first") }, // 84: choose a venue
  { page: "venue", controls: control("tutorial-discipline-section-btn") }, // 85: expand discipline section
  { page: "venue" }, // 86: mare tier info
  { page: "venue" }, // 87: competition block info
  { page: "venue", controls: control("tutorial-compete-btn"), mutations: ["tutorial.compete"] }, // 88: enter
  { page: "venue", destinations: ["venues"], controls: ['[data-tutorial="venue-back-link"]'] }, // 89: all venues back link
  { page: "venues", destinations: ["mare"], controls: ['[data-tutorial="venues-back-link"]'] }, // 90: back to animal
  { page: "mare", controls: control("competition-history-tab") }, // 91: comp history tab
  { page: "mare" }, // 92: first competition result
  { page: "mare", controls: control("discipline-tab-2") }, // 93: secondary discipline tab
  { page: "mare" }, // 94: progress bar
  { page: "mare" }, // 95: full page popover / unguided transition
  { page: "mare" }, // 96: devPauseStep proxy
]

export function getTutorialPolicy(step: number): StepPolicy | undefined {
  return Number.isInteger(step) ? TUTORIAL_STEPS[step] : undefined
}

export function tutorialDestination(step: number, mareId?: string | null, venueId?: string | null) {
  const page = getTutorialPolicy(step)?.page
  if (!page || (page === "mare" && !mareId) || (page === "vet" && !mareId) || (page === "venues" && !mareId) || (page === "venue" && !mareId)) return { pathname: "/dashboard", search: {} }
  if (page === "vet") return { pathname: "/vet", search: { animalId: mareId!, service: "certificates" as const } }
  if (page === "venues") return { pathname: "/venues", search: { animalId: mareId!, from: "animal" as const } }
  if (page === "venue") return venueId
    ? { pathname: `/venue/${venueId}`, search: { animalId: mareId!, from: "animal" as const } }
    : { pathname: "/dashboard", search: {} }
  return {
    pathname: page === "mare" ? `/animal/${mareId}` : `/${page}`,
    search: {},
  }
}

export function isTutorialRouteAllowed(step: number, mareId: string | null | undefined, pathname: string, search: Record<string, unknown> = {}) {
  if (pathname === "/dashboard") return true
  const policy = getTutorialPolicy(step)
  if (!policy) return false
  return [policy.page, ...(policy.destinations ?? [])].some(page => {
    if (page === "mare") return !!mareId && pathname === `/animal/${mareId}`
    if (page === "vet") return !!mareId && pathname === "/vet" && search.animalId === mareId && search.service === "certificates"
    if (page === "venues") return !!mareId && pathname === "/venues" && search.animalId === mareId && search.from === "animal"
    if (page === "venue") return !!mareId && /^\/venue\/[^/]+$/.test(pathname) && search.animalId === mareId && search.from === "animal"
    return pathname === `/${page}`
  })
}

export function canTransitionTutorial(from: number, to: number) {
  if (!getTutorialPolicy(to)) return false
  return to === from || to === from + 1 ||
    (from === 32 && to === 34) || (from === 49 && to === 51) || (from === 51 && to === 53) ||
    (from === 53 && to === 49) || (from === 67 && to === 77) ||
    (from >= 85 && from <= 90 && to === 84)
}

export function isTutorialMutationAllowed(step: number, path: string, input: Record<string, unknown>) {
  const policy = getTutorialPolicy(step)
  if (!policy) return false
  if (path === "tutorial.grantStartingGold") return policy.gold !== undefined && input.amount === policy.gold
  if (path === "tutorial.completeStep") return policy.checkpoint !== undefined && input.stepKey === policy.checkpoint
  return policy.mutations?.includes(path) ?? false
}
