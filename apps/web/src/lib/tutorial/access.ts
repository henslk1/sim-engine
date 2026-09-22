import { useSyncExternalStore } from "react"
import { getTutorialPolicy, isTutorialRouteAllowed } from "@sim-engine/trpc/tutorial-policy"

type Access = { restricted: boolean; running: boolean; ready: boolean; step: number; mareId: string | null; foalId: string | null; foalBreedId: string | null; recoveryMessage: string | null; venueChoiceAcknowledged: boolean }
let access: Access = { restricted: false, running: false, ready: false, step: 0, mareId: null, foalId: null, foalBreedId: null, recoveryMessage: null, venueChoiceAcknowledged: false }
const listeners = new Set<() => void>()
export function getTutorialAccess() { return access }
export function setTutorialAccess(update: Partial<Access>) {
  access = { ...access, ...update }
  listeners.forEach(listener => listener())
}
export function useTutorialAccess() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, getTutorialAccess)
}

let storageKey = "tutorial_step"
let venueStorageKey = "tutorial_venue"
let stallionStorageKey = "tutorial_stallion"
let listingStorageKey = "tutorial_listing"
let runningStorageKey = "tutorial_running"
export function configureTutorialStorage(userId: string, gameId: string) {
  storageKey = `tutorial_step:${userId}:${gameId}`
  venueStorageKey = `tutorial_venue:${userId}:${gameId}`
  stallionStorageKey = `tutorial_stallion:${userId}:${gameId}`
  listingStorageKey = `tutorial_listing:${userId}:${gameId}`
  runningStorageKey = `tutorial_running:${userId}:${gameId}`
}
export function saveTutorialRunning(running: boolean) {
  if (running) sessionStorage.setItem(runningStorageKey, "true")
  else sessionStorage.removeItem(runningStorageKey)
}
export function wasTutorialRunning() { return sessionStorage.getItem(runningStorageKey) === "true" }
export function saveTutorialVenueId(venueId: string) { localStorage.setItem(venueStorageKey, venueId) }
export function readTutorialVenueId() { return localStorage.getItem(venueStorageKey) }
export function clearTutorialVenueId() { localStorage.removeItem(venueStorageKey) }
export function saveTutorialStallionId(id: string) { localStorage.setItem(stallionStorageKey, id) }
export function readTutorialStallionId() { return localStorage.getItem(stallionStorageKey) }
export function clearTutorialStallionId() { localStorage.removeItem(stallionStorageKey) }
export function saveTutorialListingId(id: string) { localStorage.setItem(listingStorageKey, id) }
export function readTutorialListingId() { return localStorage.getItem(listingStorageKey) }
export function clearTutorialListingId() { localStorage.removeItem(listingStorageKey) }
export function readTutorialStep() {
  const raw = localStorage.getItem(storageKey) ?? localStorage.getItem("tutorial_step")
  const step = raw === null ? 0 : Number(raw)
  return getTutorialPolicy(step) ? step : 0
}
export function saveTutorialStep(step: number) {
  localStorage.setItem(storageKey, String(step))
  // Retained for older step components/dev tooling during the migration.
  localStorage.setItem("tutorial_step", String(step))
}

export function clearTutorialStep() {
  localStorage.removeItem(storageKey)
  localStorage.removeItem("tutorial_step")
  clearTutorialVenueId()
  clearTutorialStallionId()
  clearTutorialListingId()
  saveTutorialRunning(false)
}

let preparing = false
export function prepareTutorialControl(selector: string) {
  const element = document.querySelector<HTMLElement>(selector)
  if (!element) return false
  preparing = true
  try { element.click() } finally { preparing = false }
  return true
}

export function isTutorialElementAllowed(target: Element) {
  if (!access.restricted || preparing) return true
  if (target.closest('[data-tutorial-recovery], a[href="/dashboard"], [data-tutorial-signout]')) return true
  if (import.meta.env.DEV && target.closest('[data-tutorial-dev]')) return true
  if (window.location.pathname === "/dashboard" && !access.running && target.closest('[data-tutorial-resume]')) return true
  if (!access.running || !access.ready) return false
  const search = Object.fromEntries(new URLSearchParams(window.location.search))
  if (!isTutorialRouteAllowed(access.step, access.mareId, access.foalId, window.location.pathname, search, readTutorialStallionId(), readTutorialListingId(), access.foalBreedId)) return false
  if (target.closest(".driver-popover")) return true
  if (access.step === 84 && !access.venueChoiceAcknowledged) return false
  const policy = getTutorialPolicy(access.step)
  // Checked before controls: an allowed container matches via closest() for
  // everything inside it, so this is the only way to carve a nested action out.
  if (policy?.except?.some(selector => target.closest(selector))) return false
  return policy?.controls?.some(selector => target.closest(selector)) ?? false
}

// ── Trace recorder (dev aid) ─────────────────────────────────────────────────
// A failing tutorial step usually ends in a redirect to the dashboard, which
// discards anything held in memory — so this persists to sessionStorage as it
// goes. Off unless localStorage.tutorial_trace === "1"; read it back with
// readTutorialTrace() and clear it with clearTutorialTrace().
const TRACE_KEY = "tutorial_trace_log"
const tracing = () => { try { return localStorage.getItem("tutorial_trace") === "1" } catch { return false } }
function trace(entry: Record<string, unknown>) {
  if (!tracing()) return
  try {
    const log = JSON.parse(sessionStorage.getItem(TRACE_KEY) ?? "[]") as unknown[]
    log.push({ t: Math.round(performance.now()), path: location.pathname + location.search, ...entry })
    // Keep the tail: the interesting part is always the last few seconds.
    sessionStorage.setItem(TRACE_KEY, JSON.stringify(log.slice(-300)))
  } catch { /* quota or private mode — tracing is best effort */ }
}
export function readTutorialTrace() { try { return JSON.parse(sessionStorage.getItem(TRACE_KEY) ?? "[]") } catch { return [] } }
export function clearTutorialTrace() { try { sessionStorage.removeItem(TRACE_KEY) } catch { /* ignore */ } }
export function setTutorialTracing(on: boolean) {
  try { on ? localStorage.setItem("tutorial_trace", "1") : localStorage.removeItem("tutorial_trace") } catch { /* ignore */ }
}

let installed = false
export function installTutorialInteractionGuard() {
  if (installed) return
  installed = true
  const guard = (event: Event) => {
    if (!access.restricted || !(event.target instanceof Element)) return
    // Scrolling and text selection are harmless. Keyboard activation, input,
    // pointer activation and programmatic clicks all pass through the same gate.
    if (event instanceof KeyboardEvent && ["Tab", "Shift", "Control", "Alt", "Meta"].includes(event.key)) return
    const allowed = isTutorialElementAllowed(event.target)
    if (tracing()) {
      const el = event.target
      const pointer = event instanceof MouseEvent ? document.elementFromPoint(event.clientX, event.clientY) : null
      trace({
        event: event.type,
        allowed,
        step: access.step,
        ready: access.ready,
        running: access.running,
        target: el.tagName + (el.getAttribute("data-tutorial") ? `[${el.getAttribute("data-tutorial")}]` : ""),
        value: (el as HTMLInputElement).value,
        // What is actually under the cursor — catches a click meant for a native
        // option that landed on the popover sitting over it.
        under: pointer ? pointer.tagName + (pointer.closest(".driver-popover") ? " (INSIDE POPOVER)" : "") : null,
      })
    }
    if (allowed) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type === "focusin" && event.target instanceof HTMLElement) event.target.blur()
  }
  for (const type of ["click", "dblclick", "auxclick", "pointerdown", "mousedown", "touchstart", "keydown", "keyup", "beforeinput", "input", "change", "submit", "focusin", "dragstart"]) {
    window.addEventListener(type, guard, { capture: true, passive: false })
  }
}
