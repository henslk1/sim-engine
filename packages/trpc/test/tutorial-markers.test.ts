import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { TUTORIAL_STEPS } from "../src/tutorial-policy.ts"

// A tutorial marker that does not exist fails silently: the interaction guard
// matches nothing, so the control stays blocked and the click simply does
// nothing. `discipline-tab-1` sat in the policy for two phases while never being
// rendered anywhere, which made the primary discipline tab unclickable — and
// looked like flakiness rather than a missing selector.

const WEB_SRC = fileURLToPath(new URL("../../../apps/web/src/", import.meta.url))

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) return walk(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })
}

const files = walk(WEB_SRC)
const source = files.map((f) => readFileSync(f, "utf8")).join("\n")

// Exceptions are checked the same way: an except selector that matches nothing
// silently stops denying, which is harder to notice than a dead control.
const allSelectors = TUTORIAL_STEPS.flatMap((step) => [...(step.controls ?? []), ...(step.except ?? [])])

// Known dead, deliberately left in place: care-action-btn appears in
// foalCareControls and five other foal/mare care steps but is rendered nowhere.
// Every site that grants it also grants daily-care-perform, care-groom and
// ltc-perform, so care still works and it reads as a leftover from a rename —
// removing it was judged riskier than recording it. Drop this entry if the
// marker is ever either rendered or removed from the policy.
const KNOWN_DEAD = new Set(["care-action-btn"])

test("every control selector in the policy exists in the app", () => {
  // Exact names, including several per compound selector
  // (e.g. '[data-tutorial="a"] [data-tutorial="b"]').
  const exact = new Set<string>()
  for (const selector of allSelectors) {
    for (const match of selector.matchAll(/\[data-tutorial="([^"]+)"\]/g)) exact.add(match[1]!)
  }

  const missing = [...exact].filter(
    // Quoted either way: JSX attributes use double quotes, setAttribute calls in
    // the step definitions use single.
    (name) => !KNOWN_DEAD.has(name) && !source.includes(`"${name}"`) && !source.includes(`'${name}'`),
  )
  assert.deepEqual(missing, [], `policy names no element renders: ${missing.join(", ")}`)
})

test("every prefix and non-tutorial data attribute in the policy exists in the app", () => {
  const prefixes = new Set<string>()
  const attributes = new Set<string>()
  for (const selector of allSelectors) {
    for (const match of selector.matchAll(/\[data-tutorial\^="([^"]+)"\]/g)) prefixes.add(match[1]!)
    // Attributes other than data-tutorial, e.g. [data-workspace-tab],
    // [data-energy-cost], [data-tutorial-train="true"].
    for (const match of selector.matchAll(/\[(data-[a-z-]+)(?:\^?=|\])/g)) {
      if (match[1] !== "data-tutorial") attributes.add(match[1]!)
    }
  }

  const deadPrefixes = [...prefixes].filter((prefix) => !source.includes(`data-tutorial="${prefix}`) && !source.includes(`data-tutorial={\`${prefix}`))
  assert.deepEqual(deadPrefixes, [], `prefix matches nothing: ${deadPrefixes.join(", ")}`)

  const deadAttributes = [...attributes].filter((attribute) => !source.includes(attribute))
  assert.deepEqual(deadAttributes, [], `attribute never rendered: ${deadAttributes.join(", ")}`)
})

test("tutorial markers are not passed to components that drop unknown props", () => {
  // A bare data-tutorial on these is silently discarded and never reaches the
  // DOM. Badge accepts only tutorialKey — it hid a dead
  // `genetics-tests-remaining` marker that way until the prop was added; Meter,
  // Dialog and Stat accept neither. Panel and ActionButton are absent
  // deliberately: both declare "data-tutorial" and forward it. Before adding a
  // component here, check whether it declares the attribute itself.
  const NON_FORWARDING = ["Badge", "Meter", "Dialog", "Stat"]
  const offenders: string[] = []

  for (const file of files) {
    const text = readFileSync(file, "utf8")
    for (const component of NON_FORWARDING) {
      for (const match of text.matchAll(new RegExp(`<${component}\\b[^>]*?>`, "g"))) {
        if (match[0].includes("data-tutorial=")) {
          offenders.push(`${file.slice(WEB_SRC.length)}: <${component} data-tutorial=...>`)
        }
      }
    }
  }

  assert.deepEqual(offenders, [], `use the component's own tutorialKey prop instead:\n${offenders.join("\n")}`)
})

test("the known-dead marker list is still accurate", () => {
  // If one of these starts being rendered, or is removed from the policy, the
  // exception above is stale and should go rather than mask a real check.
  for (const name of KNOWN_DEAD) {
    assert.ok(
      allSelectors.some((selector) => selector.includes(`"${name}"`)),
      `${name} is no longer referenced by any policy step — remove it from KNOWN_DEAD`,
    )
    assert.ok(
      !source.includes(`"${name}"`) && !source.includes(`'${name}'`),
      `${name} is rendered now — remove it from KNOWN_DEAD so it is checked`,
    )
  }
})
