export function isTutorialVenueEligible(
  venue: { disciplines?: { disciplineDefId: string }[] },
  disciplineId: string | null | undefined,
): boolean {
  if (!disciplineId || !venue.disciplines) return false
  return venue.disciplines.some(d => d.disciplineDefId === disciplineId)
}
