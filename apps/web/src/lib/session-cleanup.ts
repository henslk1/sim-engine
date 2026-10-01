import { socket } from "@/lib/socket"
import { endTutorialSession } from "@/lib/tutorial"

// The single teardown every sign-out path calls.
//
// Two things outlive the authenticated route tree unless something ends them:
// the tutorial's Driver.js overlay with its interaction guard, and the socket
// connection. A socket left open keeps receiving broadcasts for an account that
// has just signed out, which on a shared machine means the next person at the
// keyboard sees them.
//
// This is a courtesy rather than a guarantee. The server drops the connection
// on its next privileged event and within a minute regardless, which is what
// actually covers other tabs and clients that never call this. Doing it here
// just makes it immediate for the person in front of us.
//
// Saved tutorial progress is deliberately untouched, so the same account
// resumes at the right step after signing back in.
export function endClientSession() {
  endTutorialSession()
  socket.disconnect()
}
