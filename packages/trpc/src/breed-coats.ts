import { computeCoatFromSource, type CoatCodeSource } from "@sim-engine/engine"

type Code = string | null
type Choice = { locus: number; matches: (code: Code) => boolean }

export type BreedColorAllele = {
  frequency: number
  allele: {
    id: string
    locusId: string
    expressionRulesAsAlleleOne: { alleleTwoId: string; phenotype: string }[]
  }
}

/** Only positive-frequency alleles can form a genotype; each locus contributes
 * exactly one expression. Frequencies determine possibility, not display odds. */
export function breedCoatOptions(frequencies: readonly BreedColorAllele[]): Code[][] {
  const loci = new Map<string, Map<string, BreedColorAllele["allele"]>>()
  for (const { frequency, allele } of frequencies) {
    if (!(frequency > 0)) continue
    if (!loci.has(allele.locusId)) loci.set(allele.locusId, new Map())
    loci.get(allele.locusId)!.set(allele.id, allele)
  }
  return [...loci.values()].map(alleles => {
    const rules = new Map<string, string>()
    for (const allele of alleles.values()) {
      for (const rule of allele.expressionRulesAsAlleleOne) {
        if (rule.phenotype) rules.set(`${allele.id}:${rule.alleleTwoId}`, rule.phenotype)
      }
    }
    const options = new Set<Code>()
    for (const a of alleles.keys()) {
      for (const b of alleles.keys()) {
        options.add(rules.get(`${a}:${b}`) ?? rules.get(`${b}:${a}`) ?? null)
      }
    }
    return [...options]
  })
}

// Grouping affects the shortened preview only, never the actual coat name.
const PATTERN_CODES = new Set([
  "roan_modifier", "rabicano", "tobiano_pattern", "frame_overo", "one_sabino",
  "one_leopard", "two_leopard", "one_patn1", "two_patn1", "one_patn2", "two_patn2",
  "one_lp_modifier", "two_lp_modifier",
])

/** Evaluate the real naming engine against unresolved locus choices. A query
 * whose answer is not yet known records one choice to split. Its provisional
 * output is discarded. This avoids multiplying artwork-only variants and
 * stops exploring underlying colors when the engine returns a white override.
 * No second copy of the genetic naming/priority rules is maintained here. */
class CoatProbe implements CoatCodeSource {
  choice: Choice | null = null
  private readonly domains: readonly (readonly Code[])[]
  private readonly locations: ReadonlyMap<string, readonly number[]>
  private readonly ignorePatterns: boolean

  constructor(
    domains: readonly (readonly Code[])[],
    locations: ReadonlyMap<string, readonly number[]>,
    ignorePatterns = false,
  ) {
    this.domains = domains
    this.locations = locations
    this.ignorePatterns = ignorePatterns
  }

  hasAnyCode(): boolean {
    if (this.domains.some(options => !options.includes(null))) return true
    const locus = this.domains.findIndex(options => options.some(code => code !== null))
    if (locus < 0) return false
    this.choice ??= { locus, matches: code => code !== null }
    return true
  }

  has(code: string): boolean {
    if (this.ignorePatterns && PATTERN_CODES.has(code)) return false
    if (this.choice) return false
    let undecided = -1
    for (const locus of this.locations.get(code) ?? []) {
      const options = this.domains[locus]!
      if (!options.includes(code)) continue
      if (options.length === 1) return true
      undecided = locus
    }
    if (undecided >= 0) this.choice = { locus: undecided, matches: value => value === code }
    return false
  }
}

export function enumerateBreedCoats(
  locusOptions: readonly (readonly Code[])[],
  limits: { maxEvaluations?: number; maxColors?: number } = {},
) {
  const maxEvaluations = limits.maxEvaluations ?? 2_000_000
  const maxColors = limits.maxColors ?? 50_000
  const domains = locusOptions.map(options => [...new Set(options)])
  const locations = new Map<string, number[]>()
  domains.forEach((options, locus) => {
    for (const code of options) {
      if (code === null) continue
      if (!locations.has(code)) locations.set(code, [])
      locations.get(code)!.push(locus)
    }
  })

  const pending = domains.some(options => options.length === 0) ? [] : [domains]
  const families = new Map<string, Set<string>>()
  const found = new Set<string>()
  let evaluatedStates = 0
  // Depth-first search: keep only unresolved branches, never a Cartesian
  // product of genotype arrays. Both computation and stored output are capped.
  while (pending.length && evaluatedStates < maxEvaluations && found.size < maxColors) {
    const state = pending.pop()!
    evaluatedStates++
    const probe = new CoatProbe(state, locations)
    const color = computeCoatFromSource(probe)
    let choice = probe.choice
    let family: string | null = null
    if (!choice && color) {
      const core = new CoatProbe(state, locations, true)
      family = computeCoatFromSource(core)
      choice = core.choice
    }
    if (choice) {
      const { locus, matches } = choice
      const yes = state[locus]!.filter(matches)
      const no = state[locus]!.filter(code => !matches(code))
      for (const subset of [yes, no]) {
        const branch = state.slice()
        branch[locus] = subset
        pending.push(branch)
      }
    } else if (color) {
      const key = family ?? color
      if (!families.has(key)) families.set(key, new Set())
      families.get(key)!.add(color)
      found.add(color)
    }
  }

  // Round-robin across real color families, rather than alphabetical ends.
  const groups = [...families.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, names]) =>
    [...names].sort((a, b) => a.split(" ").length - b.split(" ").length || a.localeCompare(b)))
  const sampled = new Set<string>()
  const target = Math.max(100, groups.length)
  for (let index = 0; sampled.size < target; index++) {
    let added = false
    for (const group of groups) {
      const color = group[index]
      if (color && !sampled.has(color)) { sampled.add(color); added = true }
      if (sampled.size >= target) break
    }
    if (!added) break
  }
  return {
    coatColors: [...sampled].sort(),
    allCoatColors: [...found].sort(),
    coatColorOverflow: found.size - sampled.size,
    coatColorsTruncated: pending.length > 0,
    evaluatedStates,
  }
}
