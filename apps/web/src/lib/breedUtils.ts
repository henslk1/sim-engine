export type AlleleFreqForPhenotypes = {
  frequency: number
  allele: {
    id: string
    locusId: string
    locus: {
      name: string
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

const COLOR_ROLE_ORDER = ["BASE", "DILUTION", "MODIFIER", "WHITE_PATTERN"]

export function computeColorGroupPhenotypes(
  alleleFrequencies: AlleleFreqForPhenotypes[]
): ColorGroupPhenotypes[] {
  const active = alleleFrequencies.filter(af => af.frequency > 0)

  const poolByLocus = new Map<string, Set<string>>()
  const locusRole = new Map<string, string>()
  for (const af of active) {
    const entry = af.allele.locus.panelEntries.find(e => e.panelDef.panelType === "COLOR" && e.panelDef.colorRole != null)
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
      if (rule.phenotype && pool.has(rule.alleleTwoId)) set.add(rule.phenotype)
    }
    for (const rule of af.allele.expressionRulesAsAlleleTwo) {
      if (rule.phenotype && pool.has(rule.alleleOneId)) set.add(rule.phenotype)
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
  { excludeColorLoci = false }: { excludeColorLoci?: boolean } = {},
): PossibleLocusPhenotypes[] {
  const active = alleleFrequencies.filter(af => af.frequency > 0)

  const poolByLocus = new Map<string, Set<string>>()
  for (const af of active) {
    if (excludeColorLoci && af.allele.locus.panelEntries.some(e => e.panelDef.panelType === "COLOR")) continue
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
  return result.sort((a, b) => (a.section?.displayOrder ?? 999) - (b.section?.displayOrder ?? 999))
}
