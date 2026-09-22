// Driver.js indexes are zero based. Every step grants its own routes, controls,
// and mutations; a spotlight is explanatory and does not itself grant access.
export type TutorialPage = "dashboard" | "shop" | "stable" | "mare" | "vet" | "town" | "venues" | "venue" | "stud-market" | "breeding" | "stallion"
  | "foal" | "foal-vet" | "directory" | "breeds" | "breed-profile" | "personality-directory"
type StepPolicy = {
  page: TutorialPage
  destinations?: TutorialPage[]
  controls?: string[]
  // Denied even when a `controls` selector would otherwise match. The guard
  // resolves a control with closest(), so an allowed container also allows every
  // interactive element nested inside it — including ones whose destination the
  // step does not permit, which bounces the player to the dashboard.
  except?: string[]
  mutations?: string[]
  checkpoint?: string
  gold?: number
  premium?: boolean
  vetService?: "certificates" | "otc"
}
const control = (...names: string[]) => names.map(name => `[data-tutorial="${name}"]`)
const trainingControls = ['[data-tutorial="training-panel"] [data-energy-cost]', '[data-tutorial-train="true"] > button']
const profileExplorationControls = [
  '[data-workspace-tab]',
  '[data-tutorial^="genetics-tab-"]',
  '[data-tutorial="genetics-color-content"] [data-tutorial="genetics-test-locus-btn"]',
  '[data-tutorial="genetics-color-content"] [data-tutorial="genetics-test-panel-btn"]',
]
const mareCareControls = control("daily-care-perform", "care-groom", "ltc-perform")
const foalCareControls = [
  '[data-tutorial="daily-care-perform"]',
  '[data-tutorial="care-groom"]',
  '[data-tutorial="ltc-perform"]',
  '[data-tutorial="care-action-btn"]',
  '[data-tutorial="advance-age"]',
]
const foalSafeProfileControls = [
  '[data-workspace-tab]',
  '[data-tutorial^="genetics-tab-"]',
]
// The foal, unlike the tutorial mare, is not exempt from random illness/injury —
// every unguided foal-growth phase below needs the full diagnose-and-treat path
// (mirrors the scripted mare illness arc at steps 101-114), not just vet navigation.
const foalHealthControls = [
  '[data-tutorial="comprehensive-exam-option"]',
  '[data-tutorial="run-exam-btn"]',
  '[data-tutorial="health-treatment-option"]',
  '[data-tutorial="buy-at-vet"]',
  // Unlike the mare's scripted OTC step, there's no single "required" item known in
  // advance here — any illness could strike, so any OTC listing's buy button works.
  '[data-tutorial="otc-buy-btn"]',
  '[data-tutorial="administer-btn"]',
]
const foalHealthMutations = ["vet.exam", "vet.startTreatment", "inventory.buy", "vet.administerTreatment"]
export const TUTORIAL_CERTIFICATES = ["Coggins Certificate", "Vaccination Certificate"]
// Index range where the foal (not the mare) is the tutorial subject — see tutorialAnimalId
// in tutorial-guard.ts. Every step in this range gets the vet flow layered on afterward,
// below, regardless of what its own scripted action is: the foal can fall ill or get hurt
// on any of them, and the player must always have a way to treat it, not just on the
// handful of steps designed to be "unguided."
const FOAL_PHASE_START = 164
const FOAL_PHASE_END = 212
const RAW_TUTORIAL_STEPS: readonly StepPolicy[] = [
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
      ...profileExplorationControls,
    ],
    mutations: ["tutorial.compete", "care.perform", "care.performLtc", "animal.advanceAge", "genetics.testLocus", "genetics.testPanel"],
  },
  // 97-98 both tell the player to finish the day's care before resting her, so
  // both have to permit it. Allowing it only up to step 96 locked anyone who
  // hadn't finished care out of it for the rest of the cycle.
  {
    page: "mare",
    checkpoint: "step_unguided_compete",
    controls: mareCareControls,
    mutations: ["care.perform", "care.performLtc"],
  }, // 97: "A New Tier" modal
  {
    page: "mare",
    controls: [...mareCareControls, ...control("advance-age")],
    mutations: ["care.perform", "care.performLtc", "animal.advanceAge"],
  }, // 98: "Ready for Tomorrow" — advance age (triggers illness server-side)
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
  { page: "mare" }, // 135: Breeding Grade spotlight
  { page: "mare", destinations: ["stud-market"], controls: control("browse-stud-market") }, // 136: Browse Stud Market nav
  { page: "stud-market", checkpoint: "step_stud_market" }, // 137: Stud Listings
  { page: "stud-market", controls: control("tutorial-stud-listing-card"), except: control("stud-card-view-page", "stud-card-book-btn") }, // 138: View the Listing
  { page: "stud-market" }, // 139: Stud Advertisement (info)
  { page: "stud-market", destinations: ["stallion"], controls: control("stud-view-animal-page") }, // 140: Meet the Stud
  // Read-only profile exploration: workspace tabs, genetics sub-tabs, the
  // conformation accordions and the discipline tabs. Nav links and the
  // inspection link stay blocked — they leave the flow.
  { page: "stallion", destinations: ["stud-market"], controls: ['[data-workspace-tab]', '[data-tutorial^="genetics-tab-"]', '[data-tutorial="conformation-section-btn"]', ...control("discipline-tab-1", "discipline-tab-2"), '[data-tutorial="view-stud-ad-btn"]'] }, // 141: Review His Profile
  { page: "stud-market", destinations: ["breeding"], controls: control("stud-book-btn") }, // 142: Book a Breeding
  { page: "breeding", controls: control("breeding-female-select"), checkpoint: "step_breeding_page" }, // 143: Choose the Dam
  // The dam select stays reachable through the comparison steps: landing here
  // without a dam leaves nothing for the step to spotlight, and blocking the
  // only control that fixes it is a dead end.
  { page: "breeding", controls: control("breeding-female-select") }, // 144: Compare the Pair
  { page: "breeding", controls: control("breeding-female-select") }, // 145: Conception Chance
  { page: "breeding", controls: control("breeding-female-select") }, // 146: Offspring COI
  { page: "breeding", controls: control("breeding-female-select") }, // 147: Stud Fee (conditional skip)
  { page: "breeding", controls: control("breeding-predictor-btn"), mutations: ["breeding.cover.runPredictor", "tutorial.runPredictor"] }, // 148: Preview a Foal
  { page: "breeding", controls: control("breeding-female-select") }, // 149: One Possible Foal
  { page: "breeding", controls: control("breeding-confirm-btn"), mutations: ["breeding.cover.send", "breeding.cover.accept"] }, // 150: Confirm the Pairing
  { page: "breeding" }, // 151: Conception Successful (waitForElement on breeding-result)
  { page: "breeding", destinations: ["mare"], controls: control("breeding-go-to-mare-btn") }, // 152: Go to mare
  { page: "mare", checkpoint: "step_pregnancy" }, // 153: Active Pregnancy
  { page: "mare" }, // 154: Embryo Flushing (info)
  { page: "mare" }, // 155: Ultrasound Info (locked)
  { // 156: Unguided gestation — care + age freely until ultrasound opens
    page: "mare",
    controls: [
      '[data-tutorial="daily-care-perform"]',
      '[data-tutorial="care-groom"]',
      '[data-tutorial="ltc-perform"]',
      '[data-tutorial="care-action-btn"]',
      '[data-tutorial="advance-age"]',
      ...profileExplorationControls,
    ],
    mutations: ["care.perform", "care.performLtc", "animal.advanceAge", "genetics.testLocus", "genetics.testPanel"],
  },
  { page: "mare", controls: control("ultrasound-btn"), mutations: ["breeding.pregnancy.ultrasound"] }, // 157: Ultrasound Available
  { page: "mare" }, // 158: Ultrasound Result — "A First Look"
  { // 159: Continue to Birth (unguided — completion: pregnancy complete)
    page: "mare",
    controls: [
      '[data-tutorial="daily-care-perform"]',
      '[data-tutorial="care-groom"]',
      '[data-tutorial="ltc-perform"]',
      '[data-tutorial="care-action-btn"]',
      '[data-tutorial="advance-age"]',
      ...profileExplorationControls,
    ],
    mutations: ["care.perform", "care.performLtc", "animal.advanceAge", "genetics.testLocus", "genetics.testPanel"],
  },
  { page: "mare" }, // 160: Birth Event — "A New Beginning"
  { page: "mare", controls: control("birth-name-input", "birth-name-confirm"), mutations: ["breeding.pregnancy.birth"] }, // 161: Name the Foal
  { page: "mare", destinations: ["stable"], controls: control("stable-nav") }, // 162: Visit the New Horse
  { page: "stable", controls: control("tutorial-return-mare-btn"), mutations: ["tutorial.returnMare"] }, // 163: Return the Mare (+300G)
  { page: "stable", destinations: ["foal"], controls: ['[data-tutorial="tutorial-foal-stable-card"] a'] }, // 165 (spec 166): Select the Foal
  { page: "foal" }, // 166 (spec 167): Early Development
  { // 167 (spec 168): Grow to Six Months (unguided — completion: life stage; no loci testing)
    page: "foal",
    destinations: ["stable", "town", "foal-vet"],
    controls: [
      ...foalCareControls,
      ...foalSafeProfileControls,
      '[data-tutorial="stable-nav"]',
      '[data-tutorial="town-nav"]',
      '[data-tutorial="tutorial-foal-stable-card"] a',
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="vet-back-link"]',
      ...foalHealthControls,
    ],
    mutations: ["care.perform", "care.performLtc", "animal.advanceAge", ...foalHealthMutations],
  },
  { page: "foal" }, // 168 (spec 169): Six-Month Milestone
  { page: "foal", destinations: ["directory"], controls: control("directory-nav") }, // 169 (spec 170): Open Directories
  { page: "directory", destinations: ["breeds"], controls: control("breeds-directory-card") }, // 170 (spec 171): Breed Directory
  { page: "breeds", destinations: ["breed-profile"], controls: control("tutorial-breed-card") }, // 171 (spec 172): Select the Breed
  { page: "breed-profile" }, // 172 (spec 173): Breed Profile info
  { page: "breed-profile", controls: control("breed-standard-tab") }, // 173 (spec 174): Open Breed Standard
  { page: "breed-profile" }, // 174 (spec 175): Breed Standard info
  { page: "breed-profile" }, // 175 (spec 177): Disqualifying Traits (spec 176 skipped)
  { page: "breed-profile", destinations: ["stable"], controls: control("stable-nav") }, // 176 (spec 178): Return to Stable
  { page: "stable", destinations: ["foal"], controls: ['[data-tutorial="tutorial-foal-stable-card"] a'] }, // 177 (spec 179): Select the Foal
  { page: "foal" }, // 178 (spec 180): Inspection Message
  { page: "foal", destinations: ["venues"], controls: control("find-inspection-show") }, // 179 (spec 181): Find Inspection Show
  { page: "venues", destinations: ["venue"], controls: control("tutorial-venue-card", "venue-card-first") }, // 180 (spec 182): Inspection Event info
  { page: "venue", controls: control("tutorial-inspect-btn"), mutations: ["competition.inspect"] }, // 181 (spec 183): Complete the Inspection
  { page: "venue", destinations: ["venues", "stable"], controls: control("venue-back-link", "stable-nav") }, // 182 (spec 184): Return to Stable
  { page: "stable", destinations: ["foal"], controls: ['[data-tutorial="tutorial-foal-stable-card"] a'] }, // 183 (spec 185): Select the Foal
  { page: "foal" }, // 184 (spec 186): Overall Score
  { page: "foal" }, // 185 (spec 187): Section Results
  { page: "foal", controls: control("genetics-tab") }, // 186 (spec 188): Open Genetics tab
  { page: "foal", controls: control("genetics-tab-conformation") }, // 187 (spec 189): Open Conformation sub-tab
  { page: "foal" }, // 188 (spec 190): Terrain Loci info
  { page: "foal" }, // 189 (spec 191): Climate Loci info
  { page: "foal", controls: control("genetics-complete-profile-btn"), mutations: ["genetics.testCompleteProfile"] }, // 190 (spec 192): Complete Genetic Test
  { page: "foal" }, // 191 (spec 193): Testing Complete
  { page: "foal" }, // 192 (spec 194): Competition Panel info
  { page: "foal", controls: control("discipline-select", "discipline-confirm"), mutations: ["animal.setDiscipline"] }, // 193 (spec 195): Choose Discipline
  { // 194 (spec 196): Prepare for Competition (unguided — no aging; pulse missing requirements)
    page: "foal",
    destinations: ["shop", "stable", "foal-vet", "town"],
    controls: [
      '[data-tutorial="daily-care-perform"]',
      '[data-tutorial="care-groom"]',
      '[data-tutorial="ltc-perform"]',
      '[data-tutorial="care-action-btn"]',
      ...foalSafeProfileControls,
      '[data-tutorial="stable-nav"]',
      '[data-tutorial="town-nav"]',
      '[data-tutorial="shop-nav"]',
      '[data-tutorial="equip-action"]',
      '[data-tutorial="tutorial-equip-item"] button',
      '[data-tutorial="equip-modal-close"]',
      '[data-tutorial="tutorial-shop-buy"]',
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="book-cert-testing"]',
      '[data-tutorial="cert-issue-btn"]',
      '[data-tutorial="vet-back-link"]',
      ...foalHealthControls,
    ],
    mutations: ["care.perform", "care.performLtc", "inventory.buy", "inventory.equip", "vet.issueCert", ...foalHealthMutations],
  },
  { page: "foal" }, // 195 (spec 197): Requirements Met
  { page: "foal", destinations: ["venues"], controls: control("view-venues-btn") }, // 196 (spec 198): View Venues
  { page: "venues", destinations: ["venue"], controls: control("tutorial-venue-card", "venue-card-first") }, // 197 (spec 199): Compare Venues
  { page: "venue", controls: control("tutorial-discipline-section-btn") }, // 198 (spec 200): Expand discipline section
  { page: "venue" }, // 199 (spec 201): Explain Scoring
  { page: "venue", controls: control("tutorial-compete-btn"), mutations: ["tutorial.competeConformation"] }, // 200 (spec 202): Enter the Show
  { page: "foal" }, // 201 (spec 204): Current Tier — auto-redirect from venue (spec 203 skipped)
  { page: "foal" }, // 202 (spec 205): Progress and Points
  { page: "foal", controls: control("competition-history-tab") }, // 203 (spec 206): Open Competition History
  { page: "foal" }, // 204 (spec 207): Recorded Result
  { page: "foal" }, // 205 (spec 208): Bonding Panel
  { page: "foal" }, // 206 (spec 209): Personality Shifts
  { page: "foal", destinations: ["directory"], controls: control("directory-nav") }, // 207 (spec 210): Open Directories
  { page: "directory", destinations: ["personality-directory"], controls: control("personality-directory-card") }, // 208 (spec 211): Personality Directory
  { page: "personality-directory" }, // 209 (spec 212): Trait Reference
  { // 210 (spec 213): Explore and Return (unguided — stable-nav pulsing; completion: foal profile opened)
    page: "foal",
    destinations: ["stable", "directory", "personality-directory", "breeds", "breed-profile", "foal-vet"],
    controls: [
      '[data-tutorial="stable-nav"]',
      '[data-tutorial="tutorial-foal-stable-card"] a',
      ...foalSafeProfileControls,
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="vet-back-link"]',
      ...foalHealthControls,
    ],
    mutations: [...foalHealthMutations],
  },
  { page: "foal" }, // 211 (spec 214): Bonding is Optional
  { // 212 (spec 215): Grow to Youngstock (unguided — completion: life stage)
    page: "foal",
    destinations: ["stable", "town", "foal-vet", "directory", "personality-directory", "breeds", "breed-profile", "venues", "venue"],
    controls: [
      ...foalCareControls,
      ...foalSafeProfileControls,
      '[data-tutorial="stable-nav"]',
      '[data-tutorial="town-nav"]',
      '[data-tutorial="directory-nav"]',
      '[data-tutorial="view-venues-btn"]',
      '[data-tutorial="tutorial-venue-card"]',
      '[data-tutorial="venue-card-first"]',
      '[data-tutorial="tutorial-discipline-section-btn"]',
      '[data-tutorial="tutorial-compete-btn"]',
      '[data-tutorial="venue-back-link"]',
      '[data-tutorial="venues-back-link"]',
      '[data-tutorial="competition-history-tab"]',
      '[data-tutorial="competition-section-btn"]',
      '[data-tutorial="competition-enter-btn"]',
      '[data-tutorial="stage-activity-btn"]',
      '[data-tutorial="tutorial-foal-stable-card"] a',
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="vet-back-link"]',
      ...foalHealthControls,
    ],
    mutations: ["care.perform", "care.performLtc", "animal.advanceAge", "competition.enter", "stageActivity.perform", ...foalHealthMutations],
  },
  { page: "foal" }, // 213 (spec 216): Youngstock Reached
  { page: "foal", mutations: ["tutorial.completeStep"], checkpoint: "tutorial_complete" }, // 214 (spec 217): Tutorial Complete
]

function withFoalVetAccess(policy: StepPolicy): StepPolicy {
  return {
    ...policy,
    destinations: [...(policy.destinations ?? []), "foal-vet"],
    controls: [
      ...(policy.controls ?? []),
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="vet-back-link"]',
      ...foalHealthControls,
    ],
    mutations: [...(policy.mutations ?? []), ...foalHealthMutations],
  }
}

export const TUTORIAL_STEPS: readonly StepPolicy[] = RAW_TUTORIAL_STEPS.map((policy, index) =>
  index >= FOAL_PHASE_START && index <= FOAL_PHASE_END ? withFoalVetAccess(policy) : policy,
)

export function getTutorialPolicy(step: number): StepPolicy | undefined {
  return Number.isInteger(step) ? TUTORIAL_STEPS[step] : undefined
}

export function tutorialDestination(step: number, mareId?: string | null, foalId?: string | null, venueId?: string | null, stallionId?: string | null, listingId?: string | null, foalBreedId?: string | null) {
  const page = getTutorialPolicy(step)?.page
  const activeAnimalId = foalId || mareId
  if (!page) return { pathname: "/dashboard", search: {} }
  if (page === "foal") return foalId ? { pathname: `/animal/${foalId}`, search: {} } : { pathname: "/dashboard", search: {} }
  if (page === "foal-vet") return foalId ? { pathname: "/vet", search: { animalId: foalId } } : { pathname: "/dashboard", search: {} }
  if (page === "directory") return { pathname: "/directory", search: {} }
  if (page === "breeds") return { pathname: "/breeds", search: {} }
  if (page === "breed-profile") return foalBreedId ? { pathname: `/breeds/${foalBreedId}`, search: {} } : { pathname: "/dashboard", search: {} }
  if (page === "personality-directory") return { pathname: "/directory/personality", search: {} }
  if (page === "mare" && !mareId) return { pathname: "/dashboard", search: {} }
  if (page === "vet") {
    if (!mareId) return { pathname: "/dashboard", search: {} }
    const vs = getTutorialPolicy(step)?.vetService
    return vs
      ? { pathname: "/vet", search: { animalId: mareId, service: vs as "certificates" | "otc" } }
      : { pathname: "/vet", search: { animalId: mareId } }
  }
  if (page === "venues") {
    if (!activeAnimalId) return { pathname: "/dashboard", search: {} }
    return { pathname: "/venues", search: { animalId: activeAnimalId, from: "animal" as const } }
  }
  if (page === "venue") {
    if (!activeAnimalId || !venueId) return { pathname: "/dashboard", search: {} }
    return { pathname: `/venue/${venueId}`, search: { animalId: activeAnimalId, from: "animal" as const } }
  }
  if (page === "stallion") return stallionId
    ? { pathname: `/animal/${stallionId}`, search: {} }
    : { pathname: "/dashboard", search: {} }
  if (page === "stud-market") return {
    pathname: "/stud-market",
    search: listingId && step >= 139 ? { listingId } : {},
  }
  if (page === "breeding") return listingId
    ? { pathname: "/breeding/book", search: step >= 144 && mareId ? { listingId, damId: mareId } : { listingId } }
    : { pathname: "/dashboard", search: {} }
  return {
    pathname: page === "mare" ? `/animal/${mareId}` : `/${page}`,
    search: {},
  }
}

export function isTutorialRouteAllowed(step: number, mareId: string | null | undefined, foalId: string | null | undefined, pathname: string, search: Record<string, unknown> = {}, stallionId?: string | null, listingId?: string | null, foalBreedId?: string | null) {
  if (pathname === "/dashboard") return true
  const policy = getTutorialPolicy(step)
  if (!policy) return false
  const activeAnimalId = foalId || mareId
  return [policy.page, ...(policy.destinations ?? [])].some(page => {
    if (page === "mare") return !!mareId && pathname === `/animal/${mareId}`
    if (page === "foal") return !!foalId && pathname === `/animal/${foalId}`
    if (page === "foal-vet") return !!foalId && pathname === "/vet" && search.animalId === foalId
    if (page === "directory") return pathname === "/directory"
    if (page === "breeds") return pathname === "/breeds"
    if (page === "breed-profile") return !!foalBreedId && pathname === `/breeds/${foalBreedId}`
    if (page === "personality-directory") return pathname === "/directory/personality"
    if (page === "vet") {
      if (!mareId || pathname !== "/vet" || search.animalId !== mareId) return false
      if (policy.vetService) return search.service === policy.vetService
      return true
    }
    if (page === "venues") return !!activeAnimalId && pathname === "/venues" && search.animalId === activeAnimalId && search.from === "animal"
    if (page === "venue") return !!activeAnimalId && /^\/venue\/[^/]+$/.test(pathname) && search.animalId === activeAnimalId && search.from === "animal"
    if (page === "stallion") return !!stallionId && pathname === `/animal/${stallionId}`
    if (page === "stud-market") return pathname === "/stud-market" && (!listingId || search.listingId === undefined || search.listingId === listingId)
    if (page === "breeding") return pathname === "/breeding/book" && !!listingId && search.listingId === listingId
    return pathname === `/${page}`
  })
}

// A player resuming a "venue" step without a locally saved venue ID (e.g. a
// different browser/device, or localStorage cleared) can't continue mid-flow —
// there's no venue to show. Each guided venue visit needs its own restart point
// (the card-pick step just before it), not a single hardcoded one: "venue" is
// reused by the mare's competition browsing, the foal's one-time inspection,
// and the foal's own competition entry, and jumping straight to the wrong
// flow's start is an invalid transition the server rejects outright.
const VENUE_FLOWS = [
  { start: 85, end: 90, pickIndex: 84 }, // mare's competition venue flow
  { start: 180, end: 181, pickIndex: 179 }, // foal's conformation inspection
  { start: 197, end: 199, pickIndex: 196 }, // foal's competition entry
]
export function venueFlowRestartIndex(index: number): number {
  return VENUE_FLOWS.find(f => index >= f.start && index <= f.end)?.pickIndex ?? index
}

// The stud and listing IDs are local navigation context. Resuming in another
// browser without them cannot open the stallion profile or the booking page,
// so the dashboard replays the listing selection from step 138. The server has
// to accept that rewind or the recovery path conflicts with itself, which was
// surfaced to the player as "Tutorial progress changed. Continue from the
// dashboard." on the resume card — an error with no way forward.
const BREEDING_FLOW = { start: 139, end: 152, pickIndex: 138 }
export function breedingFlowRestartIndex(index: number): number {
  return index >= BREEDING_FLOW.start && index <= BREEDING_FLOW.end ? BREEDING_FLOW.pickIndex : index
}

export function canTransitionTutorial(from: number, to: number) {
  if (!getTutorialPolicy(to)) return false
  return to === from || to === from + 1 ||
    (from === 32 && to === 34) || (from === 49 && to === 51) || (from === 51 && to === 53) ||
    (from === 53 && to === 49) || (from === 67 && to === 77) ||
    to === venueFlowRestartIndex(from) || to === breedingFlowRestartIndex(from)
}

export function isTutorialMutationAllowed(step: number, path: string, input: Record<string, unknown>) {
  const policy = getTutorialPolicy(step)
  if (!policy) return false
  if (path === "tutorial.grantStartingGold") return policy.gold !== undefined && input.amount === policy.gold
  if (path === "tutorial.grantStartingPremium") return policy.premium === true
  if (path === "tutorial.completeStep") return policy.checkpoint !== undefined && input.stepKey === policy.checkpoint
  return policy.mutations?.includes(path) ?? false
}
