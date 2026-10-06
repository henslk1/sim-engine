import { Prisma } from "@sim-engine/db"

// A unique index rejected the write. Both message sending and DM creation check
// for it before falling back to reading whoever won the race — the index is
// what makes those operations safe under concurrency, so recognising its
// failure is part of the design rather than error handling bolted on.
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

export function isTransactionConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034"
}
