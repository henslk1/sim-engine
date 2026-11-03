import { test } from "node:test"
import assert from "node:assert/strict"
import { computeCoatFromCodes } from "@sim-engine/engine"
import { breedCoatOptions, enumerateBreedCoats, type BreedColorAllele } from "../src/breed-coats.ts"

const bases = [["black_base", "chestnut_base"], [null, "bay_modifier"]]
const patterns = [
  [null, "roan_modifier"], [null, "rabicano"], [null, "tobiano_pattern"],
  [null, "frame_overo"], [null, "one_sabino"],
]

function exhaustiveColors(options: (string | null)[][]): string[] {
  const colors = new Set<string>()
  function visit(index: number, codes: string[]) {
    if (index === options.length) {
      const color = computeCoatFromCodes(new Set(codes))
      if (color) colors.add(color)
      return
    }
    for (const code of options[index]!) visit(index + 1, code ? [...codes, code] : codes)
  }
  visit(0, [])
  return [...colors].sort()
}

test("breed allele frequencies constrain possible pairs, including rare alleles and reversed rules", () => {
  const allele = (id: string, frequency: number, rules: [string, string][]): BreedColorAllele => ({
    frequency, allele: { id, locusId: "cream", expressionRulesAsAlleleOne: rules.map(([alleleTwoId, phenotype]) => ({ alleleTwoId, phenotype })) },
  })
  const pool = [
    allele("N", 0, [["N", "normal"], ["Prl", "normal"]]),
    allele("Prl", 1, [["Prl", "two_pearl"]]),
    allele("Cr", 0, [["Cr", "two_cream"], ["Prl", "cream_pearl"]]),
  ]
  assert.deepEqual(breedCoatOptions(pool), [["two_pearl"]])
  pool[2]!.frequency = 0.000001
  assert.deepEqual(new Set(breedCoatOptions(pool)[0]), new Set(["two_pearl", "two_cream", "cream_pearl"]))
  assert.deepEqual(enumerateBreedCoats([["bay_modifier"], ...breedCoatOptions(pool)]).allCoatColors, ["Bay Pearl", "Perlino"])
  // A missing rule contributes no expression, rather than borrowing an unavailable allele's rule.
  assert.deepEqual(breedCoatOptions([allele("Prl", 1, [])]), [[null]])
})

const comparisonCases: [string, (string | null)[][]][] = [
  ["cream/Pearl, Champagne, Dun, Silver, Mushroom and Flaxen", [...bases, [null, "seal_brown"],
    [null, "one_cream", "two_cream", "two_pearl", "cream_pearl"],
    ...["champagne", "dun", "one_silver", "mushroom", "flaxen"].map(code => [null, code])]],
  ["LP, PATN1, PATN2 and LP modifier with true roan", [...bases,
    [null, "one_leopard", "two_leopard"], [null, "one_patn1", "two_patn1"],
    [null, "one_patn2", "two_patn2"], [null, "one_lp_modifier", "two_lp_modifier"], [null, "roan_modifier"]]],
  ["combined patterns and visual overrides", [...bases, ...patterns,
    [null, "two_sabino"], [null, "gray_modifier"], [null, "dominant_white_full", "lethal_overo"]]],
  ["mutually exclusive base and override codes on one locus", [[null, "bay_modifier", "gray_modifier"], [null, "chestnut_base", "dominant_white_full"]]],
  ["duplicate codes in different loci", [[null, "bay_modifier"], ["bay_modifier", "chestnut_base"], [null, "gray_modifier"], [null, "gray_modifier"]]],
  ["empty expressions and artwork variants", [[null, "bay_shade_light", "bay_shade_dark"], [null, "sooty"], [null, "rabicano"]]],
]
for (const [name, options] of comparisonCases) {
  test(`preview exactly matches exhaustive naming: ${name}`, () => {
    const result = enumerateBreedCoats(options)
    assert.equal(result.coatColorsTruncated, false)
    assert.deepEqual(result.allCoatColors, exhaustiveColors(options))
    assert.ok(result.coatColors.every(color => result.allCoatColors.includes(color)))
  })
}

test("exponential artwork-only combinations do not multiply naming work", () => {
  const options = [["bay_modifier"], ...Array.from({ length: 30 }, (_, i) => [null, `art_${i}_a`, `art_${i}_b`])]
  const result = enumerateBreedCoats(options)
  assert.deepEqual(result.allCoatColors, ["Bay"])
  assert.equal(result.coatColorsTruncated, false)
  assert.equal(result.evaluatedStates, 1)
})

test("mandatory homozygous Pearl survives every preview and expanded combination", () => {
  const result = enumerateBreedCoats([...bases, ["two_pearl"], ...patterns])
  assert.ok(result.allCoatColors.length > 0)
  assert.ok(result.allCoatColors.every(c => c.includes("Pearl")))
  assert.ok(result.coatColors.every(c => c.includes("Pearl")))
  for (const color of ["Bay Pearl Overo", "Bay Pearl Roan", "Bay Pearl Tobiano", "Black Pearl", "Pearl"]) {
    assert.ok(result.allCoatColors.includes(color), color)
  }
  assert.equal(result.coatColorOverflow, result.allCoatColors.length - result.coatColors.length)
})

test("Bay Pearl and Silver Bay Pearl both retain pattern examples beside Champagne families", () => {
  const result = enumerateBreedCoats([...bases,
    ["two_pearl"], [null, "champagne"], [null, "one_silver", "two_silver"], ...patterns,
  ])
  assert.ok(result.coatColorOverflow > 0)
  for (const color of ["Bay Pearl", "Bay Pearl Overo", "Bay Pearl Tobiano", "Silver Bay Pearl", "Silver Bay Pearl Overo", "Amber Pearl"]) {
    assert.ok(result.coatColors.includes(color), `${color} must be represented in the shortened list`)
  }
  for (const color of ["Bay", "Bay Overo", "Silver Bay", "Amber Champagne"]) {
    assert.ok(!result.allCoatColors.includes(color), `${color} cannot omit mandatory Pearl`)
  }
})

test("optional Pearl still permits ordinary coats; mandatory patterns cannot be stripped", () => {
  assert.deepEqual(enumerateBreedCoats([["bay_modifier"], [null, "two_pearl"]]).allCoatColors, ["Bay", "Bay Pearl"])
  assert.deepEqual(enumerateBreedCoats([["bay_modifier"], ["two_pearl"], ["tobiano_pattern"]]).allCoatColors, ["Bay Pearl Tobiano"])
})

test("mandatory visual overrides respect the naming engine's priority", () => {
  assert.deepEqual(enumerateBreedCoats([...bases, ["dominant_white_full"], [null, "gray_modifier"], ["two_sabino"]]).allCoatColors, ["Max White"])
  assert.deepEqual(enumerateBreedCoats([...bases, [null, "dominant_white_full"], ["gray_modifier"], ["two_sabino"]]).allCoatColors, ["Gray", "Max White"])
  assert.deepEqual(enumerateBreedCoats([...bases, ["one_sabino", "two_sabino"], ["two_pearl"]]).allCoatColors, ["Bay Pearl Sabino", "Black Pearl Sabino", "Pearl Sabino", "Sabino White"])
})

test("empty domains and computation/output bounds remain safe and disclose incompleteness", () => {
  assert.deepEqual(enumerateBreedCoats([...bases, []]).allCoatColors, [])
  assert.deepEqual(enumerateBreedCoats([]).allCoatColors, [])
  const options = [...bases, ["two_pearl"], ...patterns]
  const limitedWork = enumerateBreedCoats(options, { maxEvaluations: 3 })
  assert.equal(limitedWork.coatColorsTruncated, true)
  assert.equal(limitedWork.evaluatedStates, 3)
  const limitedOutput = enumerateBreedCoats(options, { maxColors: 3 })
  assert.equal(limitedOutput.coatColorsTruncated, true)
  assert.equal(limitedOutput.allCoatColors.length, 3)
})
