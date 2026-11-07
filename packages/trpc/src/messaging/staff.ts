/**
 * Moved to `../staff.ts`.
 *
 * This evaluator was correct and was the only correct one in the codebase, so
 * the authorization pass lifted it to the top level rather than writing a
 * second. The re-export keeps every messaging import - and `apps/server`,
 * which reaches it through `@sim-engine/trpc/messaging` - working unchanged.
 *
 * `../staff.ts` imports no tRPC, so the socket server still does not drag tRPC
 * in through this path.
 */
export * from "../staff.js"
