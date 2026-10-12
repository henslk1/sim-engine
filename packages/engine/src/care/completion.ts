/**
 * When a cycle's daily care counts as done.
 *
 * One rule, in one place, because two things ask the question and they must not
 * disagree: the nightly, which uses it to decide whether condition decays, and
 * the stable's pending-care indicator, which tells a player what is still owed
 * before tonight's update. An indicator that says a stable is cared for while
 * the nightly decays it would be worse than no indicator at all.
 *
 * All of a game's care actions are required — that is what the care score
 * tracks — so there is no weighting here and no partial credit. `0` configured
 * actions means a game with no daily care at all, which is complete by
 * definition rather than permanently incomplete.
 *
 * **Distinct actions, not care logs.** Nothing stops a player performing the
 * same free action three times in a cycle, and counting rows let that stand in
 * for having done three different ones — grooming an animal repeatedly
 * suppressed the decay that skipping feeding should have caused. Counting the
 * distinct actions performed is what "all care is required" actually means.
 */
export function isDailyCareComplete(distinctActionsDone: number, careActionCount: number): boolean {
  return careActionCount === 0 || distinctActionsDone >= careActionCount
}
