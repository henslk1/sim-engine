// Permission answers are values here, not exceptions.
//
// The same evaluator runs behind tRPC procedures, Socket.IO event handlers,
// upload authorization and media URL resolution. Each of those reports failure
// in a different shape — a TRPCError, an acknowledgement payload, an HTTP
// status — so the evaluator returns a decision and lets the transport translate
// it. Throwing a TRPCError in here would suit exactly one of the four.

export type MessagingDenialCode =
  | "BANNED"
  | "NO_PLAYER_ACCOUNT"
  | "CHANNEL_NOT_FOUND"
  | "GROUP_CHAT_UNAVAILABLE"
  | "CHANNEL_ARCHIVED"
  | "STAFF_ONLY"
  | "BLOCKED"
  | "DM_UNAVAILABLE"
  | "NOT_STAFF"

export type Denied = {
  ok: false
  code: MessagingDenialCode
  // Shown to the player. Several codes deliberately share wording.
  message: string
  // Server-side only, never put on the wire. Records which of the several
  // reasons behind a deliberately vague message actually fired.
  detail?: string
}

export type Granted<T> = { ok: true; value: T }

// For a plain yes/no question.
export type Check = { ok: true } | Denied

// For a question that hands something back when the answer is yes.
export type Decision<T> = Granted<T> | Denied

export const ALLOWED: Check = { ok: true }

export function deny(code: MessagingDenialCode, message: string, detail?: string): Denied {
  // exactOptionalPropertyTypes is on, so an explicit `detail: undefined` is not
  // the same as leaving the key out.
  return detail === undefined ? { ok: false, code, message } : { ok: false, code, message, detail }
}

export function allow<T>(value: T): Decision<T> {
  return { ok: true, value }
}
