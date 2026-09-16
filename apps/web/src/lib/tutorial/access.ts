import { useSyncExternalStore } from "react"
import { getTutorialPolicy, isTutorialRouteAllowed } from "@sim-engine/trpc/tutorial-policy"

type Access = { restricted: boolean; running: boolean; ready: boolean; step: number; mareId: string | null }
let access: Access = { restricted: false, running: false, ready: false, step: 0, mareId: null }
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
export function configureTutorialStorage(userId: string, gameId: string) {
  storageKey = `tutorial_step:${userId}:${gameId}`
}
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
  if (!isTutorialRouteAllowed(access.step, access.mareId, window.location.pathname, search)) return false
  if (target.closest(".driver-popover")) return true
  return getTutorialPolicy(access.step)?.controls?.some(selector => target.closest(selector)) ?? false
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
    if (isTutorialElementAllowed(event.target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.type === "focusin" && event.target instanceof HTMLElement) event.target.blur()
  }
  for (const type of ["click", "dblclick", "auxclick", "pointerdown", "mousedown", "touchstart", "keydown", "keyup", "beforeinput", "input", "change", "submit", "focusin", "dragstart"]) {
    window.addEventListener(type, guard, { capture: true, passive: false })
  }
}
