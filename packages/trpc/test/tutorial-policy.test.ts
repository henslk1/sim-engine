import { test } from "node:test"
import assert from "node:assert/strict"
import { TUTORIAL_STEPS, getTutorialPolicy, isTutorialRouteAllowed, tutorialDestination, canTransitionTutorial, isTutorialMutationAllowed } from "../src/tutorial-policy.ts"

test("dashboard is always a fallback, including unknown or corrupt indexes", () => {
  for (const step of [-1, NaN, Infinity, 1.5, ...TUTORIAL_STEPS.map((_, i) => i), 80, 999]) {
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard"), true)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/dashboard/settings"), false)
  }
})
test("every step has a valid resume destination and rejects unrelated game routes", () => {
  assert.equal(TUTORIAL_STEPS.length, 80)
  for (let step = 0; step < TUTORIAL_STEPS.length; step++) {
    const destination = tutorialDestination(step, "mare")
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
  for (const step of [-1, 1.5, NaN, 80, 1000]) {
    assert.equal(getTutorialPolicy(step), undefined)
    assert.equal(isTutorialRouteAllowed(step, "mare", "/animal/mare"), false)
    assert.equal(isTutorialMutationAllowed(step, "training.perform", {}), false)
  }
  assert.deepEqual(tutorialDestination(64, null), { pathname: "/dashboard", search: {} })
  assert.equal(isTutorialRouteAllowed(10, null, "/animal/null"), false)
})
test("actions and checkpoints do not unlock adjacent or later steps", () => {
  for (let step = 0; step < 80; step++) {
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
  for (const [from, to] of [[0, 1], [32, 34], [49, 51], [51, 53], [53, 49], [66, 79]]) assert.equal(canTransitionTutorial(from, to), true)
  for (const [from, to] of [[0, 64], [58, 64], [64, 25], [79, 80], [79, 0]]) assert.equal(canTransitionTutorial(from, to), false)
})
