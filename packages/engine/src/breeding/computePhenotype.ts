export type ExpressionRuleForPhenotype = {
  locusId: string
  alleleOneId: string
  alleleTwoId: string
  phenotype: string
}

// Core coat color logic that operates on a set of phenotype codes.
// Exported so callers can enumerate possible combinations without fake genotypes.
export function computeCoatFromCodes(codes: Set<string>): string | null {
  if (codes.size === 0) return null

  // ── Base Color ────────────────────────────────────────────────────────────
  const base: "chestnut" | "bay" | "black" = codes.has("chestnut_base")
    ? "chestnut"
    : codes.has("bay_modifier")
      ? "bay"
      : "black"

  // ── Dilutions ─────────────────────────────────────────────────────────────
  const oneCream = codes.has("one_cream")
  const twoCream = codes.has("two_cream")
  const onePearl = codes.has("one_pearl")
  const twoPearl = codes.has("two_pearl")
  const pseudoDouble = oneCream && onePearl
  const hasDun = codes.has("dun")
  const hasSilver = codes.has("one_silver") || codes.has("two_silver")
  const hasMushroom = codes.has("one_mushroom") || codes.has("two_mushroom")

  let color: string

  if (twoCream || pseudoDouble) {
    color = base === "chestnut" ? "Cremello" : base === "bay" ? "Perlino" : "Smoky Cream"
  } else if (hasDun && oneCream) {
    color = base === "chestnut" ? "Dunalino" : base === "bay" ? "Dunskin" : "Smoky Grullo"
  } else if (oneCream) {
    color = base === "chestnut" ? "Palomino" : base === "bay" ? "Buckskin" : "Smoky Black"
  } else if (twoPearl) {
    color = "Pearl"
  } else if (hasDun) {
    color = base === "chestnut" ? "Red Dun" : base === "bay" ? "Dun" : "Grullo"
  } else if (hasMushroom && base === "chestnut") {
    color = "Mushroom"
  } else {
    color = base === "chestnut" ? "Chestnut" : base === "bay" ? "Bay" : "Black"
  }

  // Silver stacks on bay/black-derived colors (not on chestnut-derived or double dilutes)
  if (hasSilver && base !== "chestnut" && !twoCream && !pseudoDouble) {
    color = "Silver " + color
  }

  // ── Roan ──────────────────────────────────────────────────────────────────
  if (codes.has("roan_modifier")) {
    if (color === "Chestnut") color = "Red Roan"
    else if (color === "Bay") color = "Bay Roan"
    else if (color === "Black") color = "Blue Roan"
    else color = color + " Roan"
  }

  // ── Full-white overrides ──────────────────────────────────────────────────
  if (codes.has("two_sabino")) return "Sabino White"

  if (codes.has("gray_modifier")) color = "Gray"
  else if (codes.has("dominant_white_full")) color = "Max White"

  // ── LP Complex Patterns ───────────────────────────────────────────────────
  const oneLeopard = codes.has("one_leopard")
  const twoLeopard = codes.has("two_leopard")
  const onePatn1 = codes.has("one_patn1")
  const twoPatn1 = codes.has("two_patn1")

  let lpPattern: string | null = null
  if (twoLeopard) {
    lpPattern = onePatn1 || twoPatn1 ? "Few Spot" : "Snowcap"
  } else if (oneLeopard) {
    if (twoPatn1) lpPattern = "Leopard"
    else if (onePatn1) lpPattern = "Blanket"
    else lpPattern = "Varnish Roan"
  }

  // ── White Patterns ────────────────────────────────────────────────────────
  const hasTobiano = codes.has("tobiano_pattern")
  const hasOvero = codes.has("frame_overo") || codes.has("lethal_overo")
  const hasSabino = codes.has("one_sabino")

  const patterns: string[] = []
  if (hasTobiano && hasOvero) {
    patterns.push("Tovero")
  } else {
    if (hasTobiano) patterns.push("Tobiano")
    if (hasOvero) patterns.push("Overo")
  }
  if (hasSabino) patterns.push("Sabino")

  // ── Assemble ──────────────────────────────────────────────────────────────
  const parts = [color]
  if (lpPattern) parts.push(lpPattern)
  parts.push(...patterns)

  return parts.join(" ")
}

export function computePhenotypeCodes(
  genotypes: Array<{ locusId: string; alleleOneId: string; alleleTwoId: string }>,
  rules: ExpressionRuleForPhenotype[],
): Array<{ locusId: string; phenotypeCode: string | null }> {
  return genotypes.map(gt => {
    const rule = rules.find(
      r =>
        r.locusId === gt.locusId &&
        r.phenotype.length > 0 &&
        ((r.alleleOneId === gt.alleleOneId && r.alleleTwoId === gt.alleleTwoId) ||
          (r.alleleOneId === gt.alleleTwoId && r.alleleTwoId === gt.alleleOneId)),
    )
    return { locusId: gt.locusId, phenotypeCode: rule?.phenotype ?? null }
  })
}

export function computePhenotypeDescription(
  genotypes: Array<{ locusId: string; alleleOneId: string; alleleTwoId: string }>,
  rules: ExpressionRuleForPhenotype[],
): string | null {
  const codes = new Set<string>()
  for (const gt of genotypes) {
    const rule = rules.find(
      (r) =>
        r.locusId === gt.locusId &&
        r.phenotype.length > 0 &&
        ((r.alleleOneId === gt.alleleOneId && r.alleleTwoId === gt.alleleTwoId) ||
          (r.alleleOneId === gt.alleleTwoId && r.alleleTwoId === gt.alleleOneId)),
    )
    if (rule) codes.add(rule.phenotype)
  }
  return computeCoatFromCodes(codes)
}
