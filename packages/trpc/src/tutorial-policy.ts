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
  premium?: boolean
  vetService?: "certificates" | "otc"
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
  { page: "mare", destinations: ["vet"], controls: control("book-cert-testing"), vetService: "certificates" },
  { page: "vet", gold: 100, vetService: "certificates" },
  { page: "vet", controls: control("cert-issue-btn"), mutations: ["vet.issueCert"], checkpoint: "step_health_certs", vetService: "certificates" },
  { page: "vet", destinations: ["mare"], controls: control("vet-back-link"), vetService: "certificates" }, // 60
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
  // 96: unguided competing phase — allowed pages, all care + compete + age mutations, no nav bar
  {
    page: "mare",
    destinations: ["venues", "venue"],
    controls: [
      '[data-tutorial="daily-care-perform"]',
      '[data-tutorial="care-groom"]',
      '[data-tutorial="ltc-perform"]',
      '[data-tutorial="advance-age"]',
      '[data-tutorial="view-venues-btn"]',
      '[data-tutorial="tutorial-venue-card"]',
      '[data-tutorial="venue-card-first"]',
      '[data-tutorial="tutorial-discipline-section-btn"]',
      '[data-tutorial="tutorial-compete-btn"]',
      '[data-tutorial="venue-back-link"]',
      '[data-tutorial="venues-back-link"]',
      '[data-tutorial="competition-history-tab"]',
      '[data-tutorial="discipline-tab-1"]',
      '[data-tutorial="discipline-tab-2"]',
    ],
    mutations: ["tutorial.compete", "care.perform", "care.performLtc", "animal.advanceAge"],
  },
  { page: "mare", checkpoint: "step_unguided_compete" }, // 97: "A New Tier" modal
  { page: "mare", controls: control("advance-age"), mutations: ["animal.advanceAge"] }, // 98: "Ready for Tomorrow" — advance age (triggers illness server-side)
  { page: "mare", checkpoint: "step_ready_for_tomorrow" }, // 99: "Something's Wrong" — illness banner spotlight
  { page: "mare" }, // 100: "Unknown Illness" — health panel spotlight
  { page: "mare", destinations: ["vet"], controls: control("visit-vet") }, // 101: visit vet button
  { page: "vet" }, // 102: Choosing an Exam — overview of all exams
  { page: "vet", premium: true }, // 103: Exam Credits — premium grant
  { page: "vet", controls: control("comprehensive-exam-option") }, // 104: Pick Exam
  { page: "vet", controls: control("run-exam-btn"), mutations: ["vet.exam"] }, // 105: Run Exam
  { page: "vet" }, // 106: Diagnosed — spotlight result
  { page: "vet", destinations: ["mare"], controls: control("vet-back-link") }, // 107: Return to mare
  { page: "mare", controls: control("health-treatment-option"), mutations: ["vet.startTreatment"] }, // 108: Choose treatment
  { page: "mare", checkpoint: "step_visit_vet" }, // 109: Treatment Active — spotlight active treatment block
  { page: "mare", destinations: ["vet"], controls: control("buy-at-vet"), vetService: "otc" }, // 110: Buy at Vet link
  { page: "vet" }, // 111: Purchase Prompt — full-page popover on vet OTC page
  { page: "vet", controls: control("otc-buy-required"), mutations: ["inventory.buy"] }, // 112: OTC Purchase
  { page: "vet", destinations: ["mare"], controls: control("vet-back-link") }, // 113: Return to mare
  { page: "mare", controls: control("administer-btn"), mutations: ["vet.administerTreatment"] }, // 114: Administer OTC
  { page: "mare" }, // 115: Treatment Started
  { page: "mare" }, // 116: Looking Beyond Today — full-page
  { page: "mare" }, // 117: Genetics workspace overview
  { page: "mare" }, // 118: Color Genetics info
  { page: "mare" }, // 119: Health Genetics info
  { page: "mare" }, // 120: Conformation Genetics info
  { page: "mare" }, // 121: Stat Genetics info
  { page: "mare", controls: control("genetics-tab-health") }, // 122: Require health tab click
  { page: "mare" }, // 123: Genetic Progress
  { page: "mare" }, // 124: Testing Methods
  { page: "mare", controls: control("genetics-test-locus-target"), mutations: ["genetics.testLocus"] }, // 125: Individual Test
  { page: "mare", controls: control("genetics-test-panel-target"), mutations: ["genetics.testPanel"] }, // 126: Panel Test
  { page: "mare", checkpoint: "step_genetics_done" }, // 127: Genetics Complete transition
  { page: "mare", controls: [...control("daily-care-perform", "care-groom", "ltc-perform"), '[data-tutorial="care-action-btn"]'], mutations: ["care.perform", "care.performLtc"] }, // 128: Back to Her Care
  { page: "mare", controls: control("advance-age"), mutations: ["animal.advanceAge"] }, // 129: Continue Her Recovery
  { page: "mare", controls: [...control("daily-care-perform", "care-groom", "ltc-perform"), '[data-tutorial="care-action-btn"]'], mutations: ["care.perform", "care.performLtc"] }, // 130: Daily Care
  { page: "mare", controls: control("administer-btn"), mutations: ["vet.administerTreatment"] }, // 131: Continue Treatment
  { page: "mare", controls: control("advance-age"), mutations: ["animal.advanceAge"] }, // 132: Finish Her Recovery (listens for conditionResolved)
  { page: "mare" }, // 133: Recovered — full-page popover
  { page: "mare", checkpoint: "step_legacy_begins" }, // 134: A Legacy Begins — full-page popover
  { page: "mare" }, // 135: devPauseStep
]

export function getTutorialPolicy(step: number): StepPolicy | undefined {
  return Number.isInteger(step) ? TUTORIAL_STEPS[step] : undefined
}

export function tutorialDestination(step: number, mareId?: string | null, venueId?: string | null) {
  const page = getTutorialPolicy(step)?.page
  if (!page || (page === "mare" && !mareId) || (page === "vet" && !mareId) || (page === "venues" && !mareId) || (page === "venue" && !mareId)) return { pathname: "/dashboard", search: {} }
  if (page === "vet") {
    const vs = getTutorialPolicy(step)?.vetService
    return vs
      ? { pathname: "/vet", search: { animalId: mareId!, service: vs as "certificates" | "otc" } }
      : { pathname: "/vet", search: { animalId: mareId! } }
  }
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
    if (page === "vet") {
      if (!mareId || pathname !== "/vet" || search.animalId !== mareId) return false
      if (policy.vetService) return search.service === policy.vetService
      return true
    }
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
  if (path === "tutorial.grantStartingPremium") return policy.premium === true
  if (path === "tutorial.completeStep") return policy.checkpoint !== undefined && input.stepKey === policy.checkpoint
  return policy.mutations?.includes(path) ?? false
}
