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
  assert.equal(TUTORIAL_STEPS.length, 97)
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
