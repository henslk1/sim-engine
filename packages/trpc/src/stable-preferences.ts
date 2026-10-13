import { z } from "zod"

export const stableSortSchema = z.enum(["name", "oldest", "youngest", "alerts", "care"])
export const stableFiltersSchema = z.object({
  sex: z.enum(["", "MALE", "FEMALE"]).default(""),
  hasAlerts: z.boolean().default(false),
  pregnant: z.boolean().default(false),
  inspected: z.boolean().default(false),
  hasDiscipline: z.boolean().default(false),
  careDue: z.boolean().default(false),
}).strict()
export type StableFilters = z.infer<typeof stableFiltersSchema>
export type StablePreferences = { sortDefault: z.infer<typeof stableSortSchema>; filterConfig: StableFilters }
export const DEFAULT_FILTERS = stableFiltersSchema.parse({})

export function readStablePreferences(saved?: { sortDefault?: unknown; filterConfig?: unknown }): StablePreferences {
  const sort = stableSortSchema.safeParse(saved?.sortDefault)
  const filters = stableFiltersSchema.safeParse(saved?.filterConfig)
  return { sortDefault: sort.success ? sort.data : "name", filterConfig: filters.success ? filters.data : { ...DEFAULT_FILTERS } }
}
