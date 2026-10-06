import type { db } from "@sim-engine/db"

// Only the delegates the loader touches, so a transaction client satisfies it
// just as well as the root client.
type CacheClient = Pick<
  typeof db,
  "gameConfig" | "lifeStageDef" | "careActionDef" | "expressionRule" | "healthConditionDef"
>

export type GenotypeKeyParts = {
  locusId: string
  alleleOneId: string
  alleleTwoId: string
}

/**
 * Matches `ExpressionRule @@unique([locusId, alleleOneId, alleleTwoId])`, which
 * is what the per-genotype `findUnique` used to look up one row at a time.
 */
export function genotypeKey(parts: GenotypeKeyParts): string {
  return `${parts.locusId}:${parts.alleleOneId}:${parts.alleleTwoId}`
}

/**
 * Everything `advanceAnimalAging` reads that is the same for every animal in a
 * game. Loaded once per nightly run instead of once per animal.
 *
 * The expression rules are the reason this exists. Aging looked up one rule per
 * genotype with `findUnique`, and an animal carries one genotype per locus — 80
 * in this game — so a 10,000-animal nightly issued 800,000 queries to read the
 * same 508 rows over and over. As a Map it is one query and 800,000 lookups.
 *
 * Safe to load outside the transaction that ages an animal: these are
 * admin-configured definitions, and nothing in a nightly writes to them.
 */
export async function loadGameAgingCache(client: CacheClient, gameId: string) {
  const [gameConfig, lifeStageDefs, careActionCount, expressionRules, illnessPool, injuryPool] =
    await Promise.all([
      client.gameConfig.findUniqueOrThrow({ where: { gameId } }),
      client.lifeStageDef.findMany({ where: { gameId }, orderBy: { stageIndex: "asc" } }),
      client.careActionDef.count({ where: { gameId } }),
      client.expressionRule.findMany({
        where: { locus: { gameId } },
        include: { ruleConditions: { include: { healthConditionDef: true } } },
      }),
      // The per-animal part of these two queries — "conditions this animal does
      // not already have" — is applied in memory from the animal's own health
      // records. What is left is game-scoped and identical every time.
      //
      // `orderBy` is new. Neither query had one, so the row order was whatever
      // Postgres happened to return, and the injury roll picks by index. Fixing
      // the order makes that roll reproducible rather than incidental.
      client.healthConditionDef.findMany({
        where: { gameId, conditionType: "ILLNESS", isGenetic: false },
        include: {
          ruleConditions: {
            select: {
              penetrance: true,
              expressionRule: { select: { locusId: true, alleleOneId: true, alleleTwoId: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      client.healthConditionDef.findMany({
        where: { gameId, conditionType: "INJURY" },
        orderBy: { id: "asc" },
      }),
    ])

  return {
    gameId,
    gameConfig,
    lifeStageDefs,
    careActionCount,
    expressionRulesByGenotype: new Map(expressionRules.map(rule => [genotypeKey(rule), rule])),
    illnessPool,
    injuryPool,
  }
}

export type GameAgingCache = Awaited<ReturnType<typeof loadGameAgingCache>>

export type HealthRecordRow = {
  conditionDefId: string
  isActive: boolean
  resolvedCycle: number | null
}

/**
 * The animal's health history, read once and answered from memory.
 *
 * Aging asked the same two questions inside a loop over every genetic rule an
 * animal's genotypes pointed at — "does a record exist" and "when was the last
 * one resolved" — one query each, every time.
 */
export function indexHealthRecords(rows: readonly HealthRecordRow[]) {
  const active = new Set<string>()
  const any = new Set<string>()
  const lastResolved = new Map<string, number | null>()

  for (const row of rows) {
    any.add(row.conditionDefId)
    if (row.isActive) {
      active.add(row.conditionDefId)
      continue
    }
    // `orderBy: { resolvedCycle: "desc" } take: 1` against Postgres sorts NULLS
    // FIRST, so an inactive record with no resolved cycle used to win that read
    // and, being null, waive the flare-up cooldown entirely. Preserved rather
    // than quietly corrected — it changes how often chronic conditions recur,
    // which is a game-balance decision and not this change's to make.
    if (!lastResolved.has(row.conditionDefId)) {
      lastResolved.set(row.conditionDefId, row.resolvedCycle)
      continue
    }
    const seen = lastResolved.get(row.conditionDefId)!
    if (seen === null) continue
    if (row.resolvedCycle === null || row.resolvedCycle > seen) {
      lastResolved.set(row.conditionDefId, row.resolvedCycle)
    }
  }

  return {
    hasActive: (conditionDefId: string) => active.has(conditionDefId),
    hasAny: (conditionDefId: string) => any.has(conditionDefId),
    lastResolvedCycle: (conditionDefId: string) => lastResolved.get(conditionDefId) ?? null,
    /**
     * Keeps the index level with a record this cycle just created.
     *
     * The queries this replaced ran fresh inside the loop, so an illness rolled
     * at the top of the cycle was already visible to the genetic-onset checks
     * below it, and two genotypes pointing at one condition could not both
     * create a record. Reading once without this would reintroduce exactly the
     * duplicates those checks exist to prevent.
     */
    markActive: (conditionDefId: string) => {
      active.add(conditionDefId)
      any.add(conditionDefId)
    },
  }
}

export type HealthRecordIndex = ReturnType<typeof indexHealthRecords>
