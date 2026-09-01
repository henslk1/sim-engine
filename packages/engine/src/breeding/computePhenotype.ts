export type ExpressionRuleForPhenotype = {
  locusId: string
  alleleOneId: string
  alleleTwoId: string
  phenotype: string
}

type CoatBase = "chestnut" | "bay" | "black" | "seal_brown"

function resolveAppaloosaPattern(codes: Set<string>): string | null {
  const oneLeopard = codes.has("one_leopard")
  const twoLeopard = codes.has("two_leopard")

  if (!oneLeopard && !twoLeopard) return null

  const onePatn1 = codes.has("one_patn1")
  const twoPatn1 = codes.has("two_patn1")

  const onePatn2 = codes.has("one_patn2")
  const twoPatn2 = codes.has("two_patn2")

  const oneModifier = codes.has("one_lp_modifier")
  const twoModifier = codes.has("two_lp_modifier")

  // ── LP/LP ────────────────────────────────────────────────────────────────

  if (twoLeopard) {
    // LP/LP + PATN1/PATN1 → Few Spot
    if (twoPatn1) {
      // Appaloosa modifier changes artwork only:
      // M/M = modified frame pigmentation
      return "Few Spot"
    }

    // LP/LP + PATN1/N → Near Few Spot
    if (onePatn1) {
      return "Near Few Spot"
    }

    // LP/LP + no PATN1 → Snowcap family
    // PATN2/PATN2 creates the extensive "Snowcap Blanket" phenotype.
    if (twoPatn2) {
      return "Snowcap Blanket"
    }

    // N/N and PATN2/N differ in artwork extent only.
    return "Snowcap"
  }

  // ── LP/N ─────────────────────────────────────────────────────────────────

  // LP/N + PATN1/PATN1
  if (twoPatn1) {
    // N/N PATN2       → Leopard
    // PATN2/N         → Leopard
    // PATN2/PATN2     → Near Leopard
    return twoPatn2 ? "Near Leopard" : "Leopard"
  }

  // LP/N + PATN1/N
  if (onePatn1) {
    // N/N PATN2       → Near Leopard
    // PATN2/N         → Near Leopard
    // PATN2/PATN2     → Leopard
    return twoPatn2 ? "Leopard" : "Near Leopard"
  }

  // LP/N + no PATN1
  // N/N PATN2       → Varnish Roan
  // PATN2/N         → Snowflake
  // PATN2/PATN2     → Blanket

  if (twoPatn2) {
    // Appaloosa modifier changes the surfaced Blanket subtype.
    if (twoModifier) return "Laced Blanket"
    if (oneModifier) return "Minimal White Blanket"
    return "Blanket"
  }

  if (onePatn2) {
    // Light / Moderate / Heavy Snowflake remain "Snowflake".
    return "Snowflake"
  }

  // Light / Normal / Heavy Varnish remain "Varnish Roan".
  return "Varnish Roan"
}


// Core coat color logic that operates on a set of phenotype codes.
// Exported so callers can enumerate possible combinations without fake genotypes.
export function computeCoatFromCodes(codes: Set<string>): string | null {
  if (codes.size === 0) return null

  // ── Absolute visual overrides ─────────────────────────────────────────────
  //
  // Max White > Gray > Sabino White > normal phenotype assembly.
  //
  // O/O lethal white foals are phenotypically essentially white, so if a coat
  // description is generated for one, it uses Max White.

  if (
    codes.has("dominant_white_full") ||
    codes.has("lethal_overo")
  ) {
    return "Max White"
  }

  if (codes.has("gray_modifier")) {
    return "Gray"
  }

  if (codes.has("two_sabino")) {
    return "Sabino White"
  }

  // ── Effective base ────────────────────────────────────────────────────────

  const geneticBase: "chestnut" | "bay" | "black" =
    codes.has("chestnut_base")
      ? "chestnut"
      : codes.has("bay_modifier")
        ? "bay"
        : "black"

  // Seal Brown only expresses on an E- A- (bay-family) background.
  const base: CoatBase =
    geneticBase === "bay" && codes.has("seal_brown")
      ? "seal_brown"
      : geneticBase

  // Bay Shade and Chestnut Shade intentionally do not affect the surfaced
  // phenotype name. They are artwork variance only.

  // ── Dilution / modifier flags ─────────────────────────────────────────────

  const oneCream = codes.has("one_cream")
  const twoCream = codes.has("two_cream")
  const creamPearl = codes.has("cream_pearl")
  const twoPearl = codes.has("two_pearl")

  // Cr/Cr and Cr/Prl share the same surfaced double-dilute mapping.
  const doubleCream = twoCream || creamPearl

  const hasChampagne = codes.has("champagne")
  const hasDun = codes.has("dun")
  const hasMushroom = codes.has("mushroom")

  const hasSilver =
    codes.has("one_silver") ||
    codes.has("two_silver")

  const hasRoan = codes.has("roan_modifier")
  const hasFlaxen = codes.has("flaxen")
  const hasRabicano = codes.has("rabicano")

  // Sooty, nd1 variance, Rabicano extent, bay/chestnut shade variance, etc.
  // intentionally affect artwork only and do not enter the surfaced name.

  let color: string

  // ── Double Cream class ────────────────────────────────────────────────────
  //
  // Cr/Cr and Cr/Prl:
  // Chestnut    → Cremello
  // Bay         → Perlino
  // Seal Brown  → Perlino
  // Black       → Smoky Cream
  //
  // Champagne and Silver are suppressed at this level of dilution.
  // Dun remains visible and surfaced.

  if (doubleCream) {
    if (base === "chestnut") {
      color = "Cremello"
    } else if (base === "black") {
      color = "Smoky Cream"
    } else {
      color = "Perlino"
    }

    if (hasDun) {
      color += " Dun"
    }

    if (hasMushroom) {
      color += " Mushroom"
    }
  }

  // ── Champagne family ──────────────────────────────────────────────────────

  else if (hasChampagne) {
    const champagneShade =
      base === "chestnut"
        ? "Gold"
        : base === "bay"
          ? "Amber"
          : base === "black"
            ? "Classic"
            : "Sable"

    const silverVisible =
      hasSilver && base !== "chestnut"

    const silverPart = silverVisible ? " Silver" : ""

    // Champagne + Cream + Dun
    if (oneCream && hasDun) {
      if (base === "black") {
        color = `Classic${silverPart} Cream Grulla`
      } else {
        color = `${champagneShade}${silverPart} Cream Dun`
      }
    }

    // Champagne + Dun
    else if (hasDun) {
      if (base === "black") {
        color = `Classic${silverPart} Grulla`
      } else {
        // Gold Dun / Amber Dun / Sable Dun
        color = `${champagneShade}${silverPart} Dun`
      }

      if (twoPearl) {
        color += " Pearl"
      }
    }

    // Champagne + one Cream
    else if (oneCream) {
      // Gold Cream Champagne
      // Amber Cream Champagne
      // Classic Cream Champagne
      // Sable Cream Champagne
      color = `${champagneShade}${silverPart} Cream Champagne`
    }

    // Champagne + Pearl
    else if (twoPearl) {
      // Gold Pearl / Amber Pearl / Classic Pearl / Sable Pearl
      color = `${champagneShade}${silverPart} Pearl`
    }

    // Champagne + Silver
    else if (silverVisible) {
      // Amber Silver / Classic Silver / Sable Silver
      color = `${champagneShade} Silver`
    }

    // Champagne alone
    else {
      color = `${champagneShade} Champagne`
    }

    if (hasMushroom) {
      color += " Mushroom"
    }
  }

  // ── Non-Champagne colors ─────────────────────────────────────────────────

  else {
    // Cream + Dun
    if (oneCream && hasDun) {
      if (base === "chestnut") {
        color = "Dunalino"
      } else if (base === "bay") {
        color = "Dunskin"
      } else {
        // Black and Seal Brown both enter the Grulla family under Dun.
        color = "Smoky Grulla"
      }
    }

    // One Cream
    else if (oneCream) {
      if (base === "chestnut") {
        color = "Palomino"
      } else if (base === "bay") {
        color = "Buckskin"
      } else if (base === "seal_brown") {
        color = "Brown Buckskin"
      } else {
        color = "Smoky Black"
      }
    }

    // Dun
    else if (hasDun) {
      if (base === "chestnut") {
        color = "Red Dun"
      } else if (base === "bay") {
        color = "Dun"
      } else {
        // Black + Dun and Seal Brown + Dun both use Grulla.
        color = "Grulla"
      }
    }

    // Undiluted base
    else {
      if (base === "chestnut") {
        color = "Chestnut"
      } else if (base === "bay") {
        color = "Bay"
      } else if (base === "seal_brown") {
        color = "Seal Brown"
      } else {
        color = "Black"
      }
    }

    // ── Pearl ────────────────────────────────────────────────────────────────
    //
    // Prl/Prl is additive.
    // Plain chestnut Pearl is simply called "Pearl".

    if (twoPearl) {
      if (color === "Chestnut") {
        color = "Pearl"
      } else {
        color += " Pearl"
      }
    }

    // ── Mushroom ─────────────────────────────────────────────────────────────
    //
    // Plain chestnut Mu/Mu is simply Mushroom.
    // On other colors it stacks additively.

    if (hasMushroom) {
      if (color === "Chestnut") {
        color = "Mushroom"
      } else {
        color += " Mushroom"
      }
    }

    // ── Silver ───────────────────────────────────────────────────────────────
    //
    // Silver surfaces whenever visible eumelanin remains.
    // It is silent on e/e-derived coats.
    // Double Cream was handled above and suppresses Silver.

    if (hasSilver && base !== "chestnut") {
      color = "Silver " + color
    }

    // ── Flaxen ───────────────────────────────────────────────────────────────
    //
    // Flaxen only matters on e/e.
    //
    // Surfaced on:
    // - Chestnut
    // - Red Dun
    // - Dunalino
    // - Pearl-derived e/e colors
    //
    // Suppressed on:
    // - Palomino
    // - Gold Champagne (handled in Champagne branch)
    // - Double Cream
    // - Anything with Mushroom

    const flaxenVisible =
      base === "chestnut" &&
      hasFlaxen &&
      !hasMushroom &&
      (
        !oneCream ||
        hasDun ||
        twoPearl
      )

    if (flaxenVisible) {
      color = "Flaxen " + color
    }
  }

  // ── LP Complex ────────────────────────────────────────────────────────────

  const lpPattern = resolveAppaloosaPattern(codes)

  // ── True Roan ─────────────────────────────────────────────────────────────
  //
  // If LP resolves to Varnish Roan, suppress the separate true-Roan wording.
  // The Rn genotype still exists genetically.

  if (hasRoan && lpPattern !== "Varnish Roan") {
    if (color === "Chestnut") {
      color = "Red Roan"
    } else if (color === "Flaxen Chestnut") {
      color = "Flaxen Red Roan"
    } else if (color === "Bay") {
      color = "Bay Roan"
    } else if (color === "Black") {
      color = "Blue Roan"
    } else if (color === "Seal Brown") {
      color = "Seal Brown Roan"
    } else {
      color += " Roan"
    }
  }

  // ── Assemble white-pattern descriptors ────────────────────────────────────
  //
  // Naming order:
  //
  // Color
  // → Rabicano
  // → Appaloosa pattern
  // → Tobiano / Overo / Tovero
  // → Sabino
  //
  // Splash and non-max Dominant White affect artwork/genetics but do not
  // surface in the phenotype name.

  const parts: string[] = [color]

  if (hasRabicano) {
    parts.push("Rabicano")
  }

  if (lpPattern) {
    parts.push(lpPattern)
  }

  const hasTobiano = codes.has("tobiano_pattern")
  const hasOvero = codes.has("frame_overo")
  const hasSabino = codes.has("one_sabino")

  if (hasTobiano && hasOvero) {
    parts.push("Tovero")
  } else {
    if (hasTobiano) parts.push("Tobiano")
    if (hasOvero) parts.push("Overo")
  }

  if (hasSabino) {
    parts.push("Sabino")
  }

  return parts.join(" ")
}


export function computePhenotypeCodes(
  genotypes: Array<{
    locusId: string
    alleleOneId: string
    alleleTwoId: string
  }>,
  rules: ExpressionRuleForPhenotype[],
): Array<{ locusId: string; phenotypeCode: string | null }> {
  return genotypes.map(gt => {
    const rule = rules.find(
      r =>
        r.locusId === gt.locusId &&
        r.phenotype.length > 0 &&
        (
          (
            r.alleleOneId === gt.alleleOneId &&
            r.alleleTwoId === gt.alleleTwoId
          ) ||
          (
            r.alleleOneId === gt.alleleTwoId &&
            r.alleleTwoId === gt.alleleOneId
          )
        ),
    )

    return {
      locusId: gt.locusId,
      phenotypeCode: rule?.phenotype ?? null,
    }
  })
}


export function computePhenotypeDescription(
  genotypes: Array<{
    locusId: string
    alleleOneId: string
    alleleTwoId: string
  }>,
  rules: ExpressionRuleForPhenotype[],
): string | null {
  const codes = new Set<string>()

  for (const gt of genotypes) {
    const rule = rules.find(
      r =>
        r.locusId === gt.locusId &&
        r.phenotype.length > 0 &&
        (
          (
            r.alleleOneId === gt.alleleOneId &&
            r.alleleTwoId === gt.alleleTwoId
          ) ||
          (
            r.alleleOneId === gt.alleleTwoId &&
            r.alleleTwoId === gt.alleleOneId
          )
        ),
    )

    if (rule) {
      codes.add(rule.phenotype)
    }
  }

  return computeCoatFromCodes(codes)
}