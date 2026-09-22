import { test } from "node:test"
import assert from "node:assert/strict"
import { TUTORIAL_STEPS, getTutorialPolicy, isTutorialRouteAllowed as isTutorialRouteAllowedRaw, tutorialDestination as tutorialDestinationRaw, canTransitionTutorial, isTutorialMutationAllowed, venueFlowRestartIndex, breedingFlowRestartIndex } from "../src/tutorial-policy.ts"
import { shopSteps } from "../../../apps/web/src/lib/tutorial/steps/shop.ts"
import { stableSteps } from "../../../apps/web/src/lib/tutorial/steps/stable.ts"
import { profileSteps } from "../../../apps/web/src/lib/tutorial/steps/profile.ts"
import { trainingSteps } from "../../../apps/web/src/lib/tutorial/steps/training.ts"
import { competitionSteps } from "../../../apps/web/src/lib/tutorial/steps/competition.ts"
import { venueSteps } from "../../../apps/web/src/lib/tutorial/steps/venues.ts"
import { foalSteps } from "../../../apps/web/src/lib/tutorial/steps/foal.ts"

// Most policy assertions predate the foal phase. Keep their concise call shape
// while supplying the complete tutorial context required by the current API.
const isTutorialRouteAllowed = (step: number, mareId: string | null, pathname: string, search: Record<string, unknown> = {}, stallionId?: string | null, listingId?: string | null) =>
  isTutorialRouteAllowedRaw(step, mareId, step >= 164 ? "foal" : null, pathname, search, stallionId, listingId, "breed")
const tutorialDestination = (step: number, mareId?: string | null, venueId?: string | null, stallionId?: string | null, listingId?: string | null) =>
  tutorialDestinationRaw(step, mareId, step >= 164 ? "foal" : null, venueId, stallionId, listingId, "breed")

test("route policy stays aligned with the actual Driver.js steps", () => {
  const ctrl = {} as Parameters<typeof shopSteps>[0]
  const callbacks = {} as Parameters<typeof shopSteps>[1]
  const driverStepCount = shopSteps(ctrl, callbacks).length + stableSteps(ctrl, callbacks).length +
    profileSteps(ctrl, callbacks).length + trainingSteps(ctrl, callbacks).length +
    competitionSteps(ctrl, callbacks).length + venueSteps(ctrl, callbacks).length + foalSteps(ctrl, callbacks).length
  assert.equal(TUTORIAL_STEPS.length, driverStepCount)
})

test("dashboard is always a fallback, including unknown or corrupt indexes", () => {
  for (const step of [-1, NaN, Infinity, 1.5, ...TUTORIAL_STEPS.map((_, i) => i), TUTORIAL_STEPS.length, 999]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard"), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard/settings"), false)
  }
})
test("every step has a valid resume destination and rejects unrelated game routes", () => {
  assert.equal(TUTORIAL_STEPS.length, 214)
  for (let step = 0; step < TUTORIAL_STEPS.length; step++) {
    const destination = tutorialDestination(step, "mare", "chosen-venue", "stallion", "listing")
    assert.equal(isTutorialRouteAllowed(step, "mare", destination.pathname, destination.search, "stallion", "listing"), true, `resume ${step}`)
    for (const path of ["/animal/another", "/animal", "/animals", "/stable/paddocks", "/shop/anything", "/market", "/venues", "/tutorial", "/messages"]) {
      assert.equal(isTutorialRouteAllowed(step, "mare", path, {}, "stallion", "listing"), false, `${step}: ${path}`)
    }
  }
})
test("vet steps cannot visit the mare, another animal, or another service", () => {
  for (const step of [58, 59]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/animal/mare"), false)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet", { animalId: "mare", service: "certificates" }), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet", { animalId: "other", service: "certificates" }), false)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet", { animalId: "mare", service: "exam" }), false)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet"), false)
  }
  assert.equal(isTutorialRouteAllowed(60, "mare", "/animal/mare"), true)
})
test("unknown indexes and missing mare IDs fail closed", () => {
  for (const step of [-1, 1.5, NaN, TUTORIAL_STEPS.length, 1000]) {
    assert.equal(getTutorialPolicy(step), undefined)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/animal/mare"), false)
    assert.equal(isTutorialMutationAllowed(step, "training.perform", {}), false)
  }
  assert.deepEqual(tutorialDestination(64, null), { pathname: "/dashboard", search: {} })
  assert.equal(isTutorialRouteAllowed(10, null, "/animal/null"), false)
})
test("actions and checkpoints do not unlock adjacent or later steps", () => {
  for (let step = 0; step < TUTORIAL_STEPS.length; step++) {
    assert.equal(isTutorialMutationAllowed(step, "animal.updateName", {}), false)
    assert.equal(isTutorialMutationAllowed(step, "animal.castrate", {}), false)
    assert.equal(isTutorialMutationAllowed(step, "future.unlistedAction", {}), false)
    assert.equal(isTutorialMutationAllowed(step, "tutorial.completeStep", { stepKey: "tutorial_complete" }), step === 213)
  }
  assert.equal(isTutorialMutationAllowed(59, "vet.issueCert", {}), true)
  for (const step of [57, 58, 60, 61, 64]) assert.equal(isTutorialMutationAllowed(step, "vet.issueCert", {}), false)
  assert.equal(isTutorialMutationAllowed(64, "animal.setSecondaryDiscipline", {}), true)
  assert.equal(isTutorialMutationAllowed(63, "animal.setSecondaryDiscipline", {}), false)
  assert.equal(isTutorialMutationAllowed(58, "tutorial.grantStartingGold", { amount: 100 }), true)
  assert.equal(isTutorialMutationAllowed(58, "tutorial.grantStartingGold", { amount: 300 }), false)
})

test("post-birth routes stay bound to the tutorial foal and its breed", () => {
  assert.equal(isTutorialRouteAllowedRaw(164, "mare", "foal", "/animal/foal"), true)
  assert.equal(isTutorialRouteAllowedRaw(164, "mare", "foal", "/animal/other"), false)
  assert.deepEqual(tutorialDestinationRaw(171, "mare", "foal", null, null, null, "breed"), { pathname: "/breeds/breed", search: {} })
  assert.deepEqual(tutorialDestinationRaw(171, "mare", "foal", null, null, null, null), { pathname: "/dashboard", search: {} })
  assert.equal(isTutorialRouteAllowedRaw(171, "mare", "foal", "/breeds/breed", {}, null, null, "breed"), true)
  assert.equal(isTutorialRouteAllowedRaw(171, "mare", "foal", "/breeds/other", {}, null, null, "breed"), false)
  assert.equal(isTutorialRouteAllowedRaw(179, "mare", "foal", "/venues", { animalId: "foal", from: "animal" }), true)
  assert.equal(isTutorialRouteAllowedRaw(179, "mare", "foal", "/venue/show", { animalId: "foal", from: "animal" }), true)
  assert.equal(isTutorialRouteAllowedRaw(179, "mare", "foal", "/venue/show", { animalId: "mare", from: "animal" }), false)
  assert.equal(isTutorialMutationAllowed(211, "competition.enter", {}), true)
  assert.equal(isTutorialMutationAllowed(211, "animal.competition.enter", {}), false)
})
test("only sequential steps and explicit training/competition branches can advance", () => {
  for (const [from, to] of [[0, 1], [32, 34], [49, 51], [51, 53], [53, 49], [67, 77], [80, 81], [84, 85], [88, 89], [87, 84]]) assert.equal(canTransitionTutorial(from, to), true)
  for (const [from, to] of [[0, 64], [58, 64], [64, 25], [89, 91], [79, 0]]) assert.equal(canTransitionTutorial(from, to), false)
})

test("the venue handoff is limited to the tutorial mare", () => {
  for (const step of [80, 81]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/venues", { animalId: "mare", from: "animal" }), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/venues", { animalId: "other", from: "animal" }), false)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/venues", { animalId: "mare", from: "town" }), false)
  }
  assert.equal(isTutorialRouteAllowed(79, "mare", "/venues", { animalId: "mare", from: "animal" }), false)
  assert.equal(isTutorialRouteAllowed(84, "mare", "/venue/chosen-venue", { animalId: "mare", from: "animal" }), true)
  assert.equal(isTutorialRouteAllowed(85, "mare", "/venue/chosen-venue", { animalId: "mare", from: "animal" }), true)
  assert.equal(isTutorialRouteAllowed(85, "mare", "/venue/chosen-venue", { animalId: "other", from: "animal" }), false)
  assert.equal(isTutorialRouteAllowed(85, "mare", "/venue/chosen-venue", { animalId: "mare", from: "town" }), false)
  assert.deepEqual(tutorialDestination(85, "mare"), { pathname: "/dashboard", search: {} })
  assert.equal(isTutorialRouteAllowed(89, "mare", "/venues", { animalId: "mare", from: "animal" }), true)
  assert.equal(isTutorialRouteAllowed(90, "mare", "/animal/mare"), true)
})

test("unguided competition permits only the mare's care, age, venue, and entry actions", () => {
  const search = { animalId: "mare", from: "animal" }
  assert.equal(isTutorialRouteAllowed(96, "mare", "/animal/mare"), true)
  assert.equal(isTutorialRouteAllowed(96, "mare", "/venues", search), true)
  assert.equal(isTutorialRouteAllowed(96, "mare", "/venue/chosen-venue", search), true)
  assert.equal(isTutorialRouteAllowed(96, "mare", "/shop"), false)
  assert.equal(isTutorialRouteAllowed(97, "mare", "/venue/chosen-venue", search), false)
  for (const path of ["tutorial.compete", "care.perform", "care.performLtc", "animal.advanceAge", "genetics.testLocus", "genetics.testPanel"]) {
    assert.equal(isTutorialMutationAllowed(96, path, {}), true, path)
  }
  // 97 ("A New Tier") and 98 ("Ready for Tomorrow") both tell the player to
  // finish the day's care before resting her, so care has to stay reachable —
  // cutting it off at 96 locked anyone mid-care out for the rest of the cycle.
  for (const path of ["care.perform", "care.performLtc"]) {
    assert.equal(isTutorialMutationAllowed(97, path, {}), true, path)
    assert.equal(isTutorialMutationAllowed(98, path, {}), true, path)
  }
  // Nothing else from the unguided phase carries past it.
  for (const path of ["tutorial.compete", "animal.advanceAge", "genetics.testLocus", "genetics.testPanel"]) {
    assert.equal(isTutorialMutationAllowed(97, path, {}), false, path)
  }
  assert.equal(isTutorialMutationAllowed(98, "animal.advanceAge", {}), true)
  assert.equal(isTutorialMutationAllowed(98, "tutorial.compete", {}), false)
})

test("breeding routes retain the selected tutorial stud and listing", () => {
  assert.deepEqual(tutorialDestination(141, "mare", null, "stallion", "listing"), { pathname: "/animal/stallion", search: {} })
  assert.deepEqual(tutorialDestination(141, "mare", null, null, "listing"), { pathname: "/dashboard", search: {} })
  assert.deepEqual(tutorialDestination(142, "mare", null, "stallion", "listing"), { pathname: "/stud-market", search: { listingId: "listing" } })
  assert.deepEqual(tutorialDestination(143, "mare", null, "stallion", "listing"), { pathname: "/breeding/book", search: { listingId: "listing" } })
  assert.deepEqual(tutorialDestination(144, "mare", null, "stallion", "listing"), { pathname: "/breeding/book", search: { listingId: "listing", damId: "mare" } })
  assert.equal(isTutorialRouteAllowed(141, "mare", "/stud-market", { listingId: "listing" }, "stallion", "listing"), true)
  assert.equal(isTutorialRouteAllowed(141, "mare", "/animal/stallion", {}, "stallion", "listing"), true)
  assert.equal(isTutorialRouteAllowed(141, "mare", "/animal/other", {}, "stallion", "listing"), false)
  assert.equal(isTutorialRouteAllowed(144, "mare", "/breeding/book", { listingId: "listing", damId: "mare" }, "stallion", "listing"), true)
  assert.equal(isTutorialRouteAllowed(144, "mare", "/breeding/book", { listingId: "other" }, "stallion", "listing"), false)
})

test("venueFlowRestartIndex sends each guided venue visit back to its own card-pick step, not a hardcoded one", () => {
  // Resuming without a saved venue ID must restart the flow the player is
  // actually in — jumping to a different flow's start is a transition the
  // server rejects outright (see canTransitionTutorial), which previously
  // deadlocked the foal's venue steps against the mare's restart index (84).
  for (const step of [85, 86, 87, 88, 89, 90]) assert.equal(venueFlowRestartIndex(step), 84, `step ${step}`)
  for (const step of [180, 181]) assert.equal(venueFlowRestartIndex(step), 179, `step ${step}`)
  for (const step of [197, 198, 199]) assert.equal(venueFlowRestartIndex(step), 196, `step ${step}`)
  // Restart indices, and anything outside a venue flow, pass through unchanged.
  for (const step of [84, 179, 196, 0, 96, 213]) assert.equal(venueFlowRestartIndex(step), step, `step ${step}`)
  for (const step of [85, 86, 87, 88, 89, 90, 180, 181, 197, 198, 199]) {
    assert.equal(canTransitionTutorial(step, venueFlowRestartIndex(step)), true, `step ${step} restart must be a valid transition`)
  }
})

test("unguided gestation allows profile exploration and color tests without other game actions", () => {
  const policy = getTutorialPolicy(156)!
  assert.equal(policy.controls?.includes('[data-workspace-tab]'), true)
  assert.equal(policy.controls?.includes('[data-tutorial^="genetics-tab-"]'), true)
  assert.equal(isTutorialMutationAllowed(156, "genetics.testLocus", {}), true)
  assert.equal(isTutorialMutationAllowed(156, "genetics.testPanel", {}), true)
  assert.equal(isTutorialMutationAllowed(156, "breeding.pregnancy.flush", {}), false)
  assert.equal(isTutorialMutationAllowed(156, "breeding.pregnancy.abort", {}), false)
  assert.equal(isTutorialMutationAllowed(157, "breeding.pregnancy.ultrasound", {}), true)
  assert.equal(isTutorialMutationAllowed(158, "breeding.pregnancy.abort", {}), false)
})

test("every foal-phase step (164-212) allows diagnosing and treating illness, not just the unguided ones", () => {
  // The foal (unlike the tutorial mare/ancestors) is not exempt from random illness/injury
  // rolls, and it can be aged (directly or via the nightly cron) while the player is parked
  // on any scripted step in this range — so every single one of them, not just the steps
  // designed to be "unguided," must allow the full diagnose-and-treat path.
  for (let step = 164; step <= 212; step++) {
    const policy = getTutorialPolicy(step)!
    for (const path of ["vet.exam", "vet.startTreatment", "inventory.buy", "vet.administerTreatment"]) {
      assert.equal(isTutorialMutationAllowed(step, path, {}), true, `step ${step}: ${path}`)
    }
    for (const control of [
      '[data-tutorial="visit-vet"]',
      '[data-tutorial="vet-back-link"]',
      '[data-tutorial="comprehensive-exam-option"]',
      '[data-tutorial="run-exam-btn"]',
      '[data-tutorial="health-treatment-option"]',
      '[data-tutorial="buy-at-vet"]',
      '[data-tutorial="otc-buy-btn"]',
      '[data-tutorial="administer-btn"]',
    ]) {
      assert.equal(policy.controls?.includes(control), true, `step ${step}: ${control}`)
    }
    assert.equal(policy.destinations?.includes("foal-vet"), true, `step ${step}: foal-vet destination`)
  }
  // Steps outside the range stay untouched — the mare's own scripted vet arc is unaffected.
  assert.equal(getTutorialPolicy(59)!.destinations?.includes("foal-vet" as never) ?? false, false)
})

test("vet exam steps show all exams, grant credits, select, then run", () => {
  const vet = { animalId: "mare" }
  for (const step of [102, 103, 104, 105, 106]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet", vet), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/vet", { animalId: "other" }), false)
  }
  const allVenueSteps = venueSteps({} as Parameters<typeof venueSteps>[0], {} as Parameters<typeof venueSteps>[1])
  const overviewIndex = allVenueSteps.findIndex(step => step.popover?.title === "Choosing an Exam")
  const vetSteps = allVenueSteps.slice(overviewIndex, overviewIndex + 4)
  assert.deepEqual(vetSteps.map(step => step.popover?.title), ["Choosing an Exam", "Exam Credits", "Pick Exam", "Run Exam"])
  const examOverview = vetSteps[0]
  assert.equal(examOverview?.element, '[data-tutorial="exam-service-list"]')
  assert.equal(examOverview?.popover?.description, "The vet offers several exams. Each can identify different conditions, so the right choice depends on what you need to find out.")
  assert.equal(getTutorialPolicy(102)?.controls?.length ?? 0, 0)
  assert.equal(getTutorialPolicy(104)?.controls?.includes('[data-tutorial="comprehensive-exam-option"]'), true)
  assert.equal(getTutorialPolicy(105)?.controls?.includes('[data-tutorial="run-exam-btn"]'), true)
  assert.equal(isTutorialMutationAllowed(102, "vet.exam", {}), false)
  assert.equal(isTutorialMutationAllowed(103, "tutorial.grantStartingPremium", {}), true)
  assert.equal(isTutorialMutationAllowed(104, "tutorial.grantStartingPremium", {}), false)
  assert.equal(isTutorialMutationAllowed(104, "vet.exam", {}), false)
  assert.equal(isTutorialMutationAllowed(105, "vet.exam", {}), true)
  assert.deepEqual(tutorialDestination(106, "mare"), { pathname: "/vet", search: { animalId: "mare" } })
  assert.equal(isTutorialMutationAllowed(97, "tutorial.completeStep", { stepKey: "step_unguided_compete" }), true)
  assert.equal(isTutorialMutationAllowed(99, "tutorial.completeStep", { stepKey: "step_ready_for_tomorrow" }), true)
  assert.equal(getTutorialPolicy(106)?.page, "vet")
  assert.equal(getTutorialPolicy(107)?.controls?.includes('[data-tutorial="vet-back-link"]'), true)
  assert.equal(getTutorialPolicy(108)?.controls?.includes('[data-tutorial="health-treatment-option"]'), true)
  assert.equal(isTutorialMutationAllowed(108, "vet.startTreatment", {}), true)
  assert.equal(isTutorialMutationAllowed(109, "tutorial.completeStep", { stepKey: "step_visit_vet" }), true)
})

test("treatment and genetics checkpoints follow completed actions", () => {
  assert.equal(isTutorialMutationAllowed(108, "vet.startTreatment", {}), true)
  assert.equal(isTutorialMutationAllowed(109, "tutorial.completeStep", { stepKey: "step_visit_vet" }), true)
  assert.equal(isTutorialMutationAllowed(111, "inventory.buy", {}), false)
  assert.equal(isTutorialMutationAllowed(112, "inventory.buy", {}), true)
  assert.equal(isTutorialMutationAllowed(116, "tutorial.completeStep", { stepKey: "step_genetics_done" }), false)
  assert.equal(isTutorialMutationAllowed(125, "genetics.testLocus", {}), true)
  assert.equal(isTutorialMutationAllowed(126, "genetics.testPanel", {}), true)
  assert.equal(isTutorialMutationAllowed(127, "tutorial.completeStep", { stepKey: "step_genetics_done" }), true)
  assert.equal(isTutorialMutationAllowed(128, "animal.advanceAge", {}), false)
  assert.equal(isTutorialMutationAllowed(129, "animal.advanceAge", {}), true)
  assert.equal(isTutorialMutationAllowed(130, "vet.administerTreatment", {}), false)
  assert.equal(isTutorialMutationAllowed(131, "vet.administerTreatment", {}), true)
  assert.equal(isTutorialMutationAllowed(132, "animal.advanceAge", {}), true)
})

test("the dashboard's breeding-flow rewind is a transition the server accepts", () => {
  // Resuming without the saved stud/listing context, the dashboard replays the
  // listing selection. If canTransitionTutorial rejects that rewind, the recovery
  // path itself 409s and the player is left on the resume card being told their
  // progress changed, with no way forward.
  for (let step = 139; step <= 152; step++) {
    assert.equal(breedingFlowRestartIndex(step), 138, `step ${step}`)
    assert.equal(canTransitionTutorial(step, 138), true, `step ${step} rewind must be allowed`)
  }
  // Outside the flow it is a no-op, and the rewind is not a licence to jump
  // backwards from anywhere.
  for (const step of [0, 138, 153, 164, 213]) assert.equal(breedingFlowRestartIndex(step), step, `step ${step}`)
  assert.equal(canTransitionTutorial(153, 138), false)
  assert.equal(canTransitionTutorial(100, 138), false)
})

test("the dam select stays reachable across the breeding comparison steps", () => {
  // Step 144's spotlight targets the parent cards, which only render once a dam
  // is chosen. Reaching these steps without one used to leave the select blocked,
  // so the player could neither fix it nor progress and Driver recovered to the
  // dashboard on a timeout.
  for (const step of [143, 144, 145, 146, 147, 149]) {
    assert.equal(isTutorialMutationAllowed(step, "breeding.cover.send", {}), step === 150, `step ${step}`)
    assert.ok(
      getTutorialPolicy(step)?.controls?.includes('[data-tutorial="breeding-female-select"]'),
      `step ${step} must keep the dam select reachable`,
    )
  }
  // Confirming the pairing is still gated to its own step.
  assert.equal(isTutorialMutationAllowed(150, "breeding.cover.send", {}), true)
})

test("an allowed container does not allow the nested actions it excepts", () => {
  // Step 138 allows the stud listing card so the player can select it, but the
  // card's own footer holds a "View page" link and a "Book" button. The guard
  // resolves controls with closest(), so without the exception those inherit the
  // card's permission and navigate somewhere the step forbids — which bounced the
  // player to the dashboard.
  const policy = getTutorialPolicy(138)!
  assert.ok(policy.controls?.includes('[data-tutorial="tutorial-stud-listing-card"]'))
  assert.deepEqual(policy.except, [
    '[data-tutorial="stud-card-view-page"]',
    '[data-tutorial="stud-card-book-btn"]',
  ])
  // Booking is still reachable at the step that owns it, via the detail panel.
  assert.ok(getTutorialPolicy(142)?.controls?.includes('[data-tutorial="stud-book-btn"]'))
  assert.ok(!getTutorialPolicy(142)?.except)
})
