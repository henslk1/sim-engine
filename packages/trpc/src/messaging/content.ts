import { allow, deny, type Decision } from "./result.js"

export const MAX_CONTENT_CODE_POINTS = 2000
export const MAX_CONTENT_BYTES = 8192

// Cleans a message body and decides whether it is sendable.
//
// Normalizing before measuring matters: line endings differ by platform, so the
// same typed message would otherwise hit the limit on Windows and clear it on
// Linux.
export function prepareContent(raw: string): Decision<string> {
  const normalized = raw.replace(/\r\n?/g, "\n").trim()

  if (normalized.length === 0) {
    return deny("CONTENT_EMPTY", "Write something first.")
  }

  // Spreading a string iterates code points rather than UTF-16 units, so an
  // emoji counts as one character instead of two.
  if ([...normalized].length > MAX_CONTENT_CODE_POINTS) {
    return deny("CONTENT_TOO_LONG", `Messages are limited to ${MAX_CONTENT_CODE_POINTS} characters.`)
  }

  // A second, defensive ceiling. A single code point can cost four bytes, so
  // the character limit alone does not bound what ends up stored.
  if (new TextEncoder().encode(normalized).length > MAX_CONTENT_BYTES) {
    return deny("CONTENT_TOO_LONG", "That message is too large to send.", "within code point limit, over byte limit")
  }

  return allow(normalized)
}
