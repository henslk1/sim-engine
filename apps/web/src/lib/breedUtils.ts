export type AlleleFreqForPhenotypes = {
  frequency: number
  allele: {
    id: string
    locusId: string
    locus: {
      name: string
      isHiddenModifier: boolean
      panelEntries: { panelDef: { panelType: string; colorRole: string | null } }[]
      sectionEntries: { section: { id: string; name: string; displayOrder: number } }[]
    }
    expressionRulesAsAlleleOne: { alleleTwoId: string; phenotype: string }[]
    expressionRulesAsAlleleTwo: { alleleOneId: string; phenotype: string }[]
  }
}

export type PossibleLocusPhenotypes = {
  locusId: string
  locusName: string
  section: { id: string; name: string; displayOrder: number } | null
  phenotypes: string[]
}

export type ColorGroupPhenotypes = {
  role: string
  phenotypes: string[]
}

const COAT_CODE_LABELS: Record<string, string> = {
  // Base
  chestnut_base: "Chestnut Base (e/e)",
  bay_modifier: "Bay (Agouti)",
  black_base: "Black Base",
  seal_brown: "Seal Brown",
  // Cream / Pearl
  one_cream: "Cream (Cr/N)",
  two_cream: "Double Cream (Cr/Cr)",
  cream_pearl: "Cream-Pearl (Cr/Prl)",
  two_pearl: "Double Pearl (Prl/Prl)",
  // Champagne
  champagne: "Champagne",
  // Dun
  dun: "Dun",
  // Silver
  one_silver: "Silver (Z/N)",
  two_silver: "Silver (Z/Z)",
  // Mushroom
  mushroom: "Mushroom",
  // Modifiers
  flaxen: "Flaxen",
  roan_modifier: "Roan",
  rabicano: "Rabicano",
  gray_modifier: "Gray",
  // White patterns
  dominant_white_full: "Dominant White",
  tobiano_pattern: "Tobiano",
  frame_overo: "Frame Overo",
  lethal_overo: "Lethal White Overo",
  one_sabino: "Sabino (Sn/N)",
  two_sabino: "Sabino White (Sn/Sn)",
  // LP Complex
  one_leopard: "Leopard Complex (Lp/N)",
  two_leopard: "Leopard Complex (Lp/Lp)",
  one_patn1: "PATN1 (P/N)",
  two_patn1: "PATN1 (P/P)",
  // LP Variance (hidden)
  one_patn2: "PATN2 (P2/N)",
  two_patn2: "PATN2 (P2/P2)",
  one_lp_modifier: "LP Modifier (M/N)",
  two_lp_modifier: "LP Modifier (M/M)",
}

export function formatCoatPhenotype(code: string): string {
  return COAT_CODE_LABELS[code] ?? code.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())
}

const COLOR_ROLE_ORDER = ["BASE", "DILUTION", "MODIFIER", "WHITE_PATTERN"]

// Phenotype codes that must never appear in coat standard or DQ config:
// lethal genotypes (horse would be dead) and artwork-only variance codes
// that affect artwork rendering only and do not surface in phenotypeDescription.
const EXCLUDED_FROM_COAT_CONFIG = new Set([
  // Lethal genotypes
  "primitive_markings",
  "lethal_overo",
  "dominant_white_lethal",
  "splash_lethal",
  // Bay / Chestnut shade variance — artwork only
  "bay_shade_high",
  "bay_shade_low",
  "bay_shade_mid",
  "chestnut_shade_normal",
  "dark_chestnut",
  "liver_chestnut",
  // Sooty — artwork only
  "heavy_sooty",
  "moderate_sooty",
  // ND1 variance — artwork only
  "nd1_marks",
  "nd1_no_marks",
  "nd1_dilution_marks",
  // Rabicano extent — artwork only (base "rabicano" code is a real coat marker and stays)
  "light_rabicano",
  "moderate_rabicano",
  "extreme_rabicano",
])

export function computeColorGroupPhenotypes(
  alleleFrequencies: AlleleFreqForPhenotypes[]
): ColorGroupPhenotypes[] {
  const active = alleleFrequencies.filter(af => af.frequency > 0)

  const poolByLocus = new Map<string, Set<string>>()
  const locusRole = new Map<string, string>()
  for (const af of active) {
    const entry = af.allele.locus.panelEntries.find(e => (e.panelDef.panelType === "COLOR" || e.panelDef.panelType === "VARIANCE") && e.panelDef.colorRole != null)
    if (!entry) continue
    if (!poolByLocus.has(af.allele.locusId)) {
      poolByLocus.set(af.allele.locusId, new Set())
      locusRole.set(af.allele.locusId, entry.panelDef.colorRole!)
    }
    poolByLocus.get(af.allele.locusId)!.add(af.allele.id)
  }

  const byRole = new Map<string, Set<string>>()
  for (const af of active) {
    const lid = af.allele.locusId
    const pool = poolByLocus.get(lid)
    if (!pool) continue
    const role = locusRole.get(lid)!
    if (!byRole.has(role)) byRole.set(role, new Set())
    const set = byRole.get(role)!
    for (const rule of af.allele.expressionRulesAsAlleleOne) {
      if (rule.phenotype && pool.has(rule.alleleTwoId) && !EXCLUDED_FROM_COAT_CONFIG.has(rule.phenotype)) set.add(rule.phenotype)
    }
    for (const rule of af.allele.expressionRulesAsAlleleTwo) {
      if (rule.phenotype && pool.has(rule.alleleOneId) && !EXCLUDED_FROM_COAT_CONFIG.has(rule.phenotype)) set.add(rule.phenotype)
    }
  }

  const result: ColorGroupPhenotypes[] = []
  for (const role of COLOR_ROLE_ORDER) {
    const phenotypes = byRole.get(role)
    if (phenotypes && phenotypes.size > 0) result.push({ role, phenotypes: [...phenotypes].sort() })
  }
  for (const [role, phenotypes] of byRole) {
    if (!COLOR_ROLE_ORDER.includes(role) && phenotypes.size > 0) {
      result.push({ role, phenotypes: [...phenotypes].sort() })
    }
  }
  return result
}

export function computePossiblePhenotypes(
  alleleFrequencies: AlleleFreqForPhenotypes[],
  { excludeColorLoci = false, excludeHealthLoci = false }: { excludeColorLoci?: boolean; excludeHealthLoci?: boolean } = {},
): PossibleLocusPhenotypes[] {
  const active = alleleFrequencies.filter(af => af.frequency > 0)

  const poolByLocus = new Map<string, Set<string>>()
  for (const af of active) {
    if (excludeColorLoci && af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "COLOR")) continue
    if (excludeHealthLoci && af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "HEALTH")) continue
    if (!poolByLocus.has(af.allele.locusId)) poolByLocus.set(af.allele.locusId, new Set())
    poolByLocus.get(af.allele.locusId)!.add(af.allele.id)
  }

  type LocusAcc = {
    name: string
    section: { id: string; name: string; displayOrder: number } | null
    phenotypes: Set<string>
  }
  const locusMap = new Map<string, LocusAcc>()

  for (const af of active) {
    const lid = af.allele.locusId
    const pool = poolByLocus.get(lid)
    if (!pool) continue
    if (!locusMap.has(lid)) {
      const se = af.allele.locus.sectionEntries[0]
      locusMap.set(lid, { name: af.allele.locus.name, section: se?.section ?? null, phenotypes: new Set() })
    }
    const entry = locusMap.get(lid)!
    for (const rule of af.allele.expressionRulesAsAlleleOne) {
      if (rule.phenotype && pool.has(rule.alleleTwoId)) entry.phenotypes.add(rule.phenotype)
    }
    for (const rule of af.allele.expressionRulesAsAlleleTwo) {
      if (rule.phenotype && pool.has(rule.alleleOneId)) entry.phenotypes.add(rule.phenotype)
    }
  }

  const result: PossibleLocusPhenotypes[] = []
  for (const [locusId, data] of locusMap) {
    if (data.phenotypes.size === 0) continue
    result.push({ locusId, locusName: data.name, section: data.section, phenotypes: [...data.phenotypes].sort() })
  }
  return result.sort((a, b) => a.locusName.localeCompare(b.locusName))
}
