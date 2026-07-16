export type ExpressionRuleForPhenotype = {
  locusId: string
  alleleOneId: string
  alleleTwoId: string
  phenotype: string
}

export function computePhenotypeDescription(
  genotypes: Array<{ locusId: string; alleleOneId: string; alleleTwoId: string }>,
  rules: ExpressionRuleForPhenotype[],
): string | null {
  const labels: string[] = []
  for (const gt of genotypes) {
    const rule = rules.find(
      (r) =>
        r.locusId === gt.locusId &&
        r.phenotype.length > 0 &&
        ((r.alleleOneId === gt.alleleOneId && r.alleleTwoId === gt.alleleTwoId) ||
          (r.alleleOneId === gt.alleleTwoId && r.alleleTwoId === gt.alleleOneId)),
    )
    if (rule) labels.push(rule.phenotype)
  }
  return labels.length > 0 ? labels.join(", ") : null
}
