export type BreedPersonalityRange = {
  naturalMin: number
  naturalMax: number
  baseline: number
}

export function isValidPersonalityRange(profile: BreedPersonalityRange): boolean {
  const { naturalMin, naturalMax, baseline } = profile
  return [naturalMin, naturalMax, baseline].every(Number.isFinite)
    && naturalMin <= baseline && baseline <= naturalMax
}

/** A triangular distribution: the baseline is the mode, not necessarily the midpoint. */
export function sampleBreedPersonality(profile: BreedPersonalityRange, random = Math.random): number {
  if (!isValidPersonalityRange(profile)) {
    throw new Error("Personality baseline must be between the natural minimum and maximum")
  }
  const { naturalMin: min, naturalMax: max, baseline } = profile
  if (min === max) return min
  const draw = random()
  const range = max - min
  return draw < (baseline - min) / range
    ? min + Math.sqrt(draw * range * (baseline - min))
    : max - Math.sqrt((1 - draw) * range * (max - baseline))
}

/** Creation only. Offspring continue to inherit their parents' innate maxima. */
export function initialImmunity(
  breedMin: number | null,
  breedMax: number | null,
  gameMax: number | null,
  random = Math.random,
): { innateMax: number; value: number } {
  const innateMax = breedMax ?? gameMax ?? 100
  const min = breedMin ?? Math.min(60, innateMax)
  if (!Number.isFinite(min) || !Number.isFinite(innateMax) || min < 0 || min > innateMax) {
    throw new Error("Creation immunity minimum must be between zero and the configured maximum")
  }
  return { innateMax, value: min + random() * (innateMax - min) }
}
