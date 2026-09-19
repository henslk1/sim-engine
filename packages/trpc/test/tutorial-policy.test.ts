import { test } from "node:test"
import assert from "node:assert/strict"
import { TUTORIAL_STEPS, getTutorialPolicy, isTutorialRouteAllowed, tutorialDestination, canTransitionTutorial, isTutorialMutationAllowed } from "../src/tutorial-policy.ts"
import { shopSteps } from "../../../apps/web/src/lib/tutorial/steps/shop.ts"
import { stableSteps } from "../../../apps/web/src/lib/tutorial/steps/stable.ts"
import { profileSteps } from "../../../apps/web/src/lib/tutorial/steps/profile.ts"
import { trainingSteps } from "../../../apps/web/src/lib/tutorial/steps/training.ts"
import { competitionSteps } from "../../../apps/web/src/lib/tutorial/steps/competition.ts"
import { venueSteps } from "../../../apps/web/src/lib/tutorial/steps/venues.ts"

test("route policy stays aligned with the actual Driver.js steps", () => {
  const ctrl = {} as Parameters<typeof shopSteps>[0]
  const callbacks = {} as Parameters<typeof shopSteps>[1]
  const driverStepCount = shopSteps(ctrl, callbacks).length + stableSteps(ctrl, callbacks).length +
    profileSteps(ctrl, callbacks).length + trainingSteps(ctrl, callbacks).length +
    competitionSteps(ctrl, callbacks).length + venueSteps(ctrl, callbacks).length + 1 // development pause
  assert.equal(TUTORIAL_STEPS.length, driverStepCount)
})

test("dashboard is always a fallback, including unknown or corrupt indexes", () => {
  for (const step of [-1, NaN, Infinity, 1.5, ...TUTORIAL_STEPS.map((_, i) => i), TUTORIAL_STEPS.length, 999]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard"), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard/settings"), false)
  }
})
test("every step has a valid resume destination and rejects unrelated game routes", () => {
  assert.equal(TUTORIAL_STEPS.length, 136)
  for (let step = 0; step < TUTORIAL_STEPS.length; step++) {
    const destination = tutorialDestination(step, "mare", "chosen-venue")
    assert.equal(isTutorialRouteAllowed(step, "mare", destination.pathname, destination.search), true, `resume ${step}`)
    for (const path of ["/animal/another", "/animal", "/animals", "/stable/paddocks", "/shop/anything", "/market", "/venues", "/tutorial", "/messages"]) {
      assert.equal(isTutorialRouteAllowed(step, "mare", path), false, `${step}: ${path}`)
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
    assert.equal(isTutorialMutationAllowed(step, "tutorial.completeStep", { stepKey: "tutorial_complete" }), false)
  }
  assert.equal(isTutorialMutationAllowed(59, "vet.issueCert", {}), true)
  for (const step of [57, 58, 60, 61, 64]) assert.equal(isTutorialMutationAllowed(step, "vet.issueCert", {}), false)
  assert.equal(isTutorialMutationAllowed(64, "animal.setSecondaryDiscipline", {}), true)
  assert.equal(isTutorialMutationAllowed(63, "animal.setSecondaryDiscipline", {}), false)
  assert.equal(isTutorialMutationAllowed(58, "tutorial.grantStartingGold", { amount: 100 }), true)
  assert.equal(isTutorialMutationAllowed(58, "tutorial.grantStartingGold", { amount: 300 }), false)
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
  for (const path of ["tutorial.compete", "care.perform", "care.performLtc", "animal.advanceAge"]) {
    assert.equal(isTutorialMutationAllowed(96, path, {}), true, path)
    assert.equal(isTutorialMutationAllowed(97, path, {}), false, path)
  }
  assert.equal(isTutorialMutationAllowed(98, "animal.advanceAge", {}), true)
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
