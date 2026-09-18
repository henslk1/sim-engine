import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"

const PULSE_STYLE_ID = "tutorial-pulse-style"

function injectPulseStyle() {
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement("style")
  style.id = PULSE_STYLE_ID
  style.textContent = `
    @keyframes tutorial-pulse {
      0%   { box-shadow: 0 0 0 0 rgba(99, 179, 237, 0.7); }
      70%  { box-shadow: 0 0 0 8px rgba(99, 179, 237, 0); }
      100% { box-shadow: 0 0 0 0 rgba(99, 179, 237, 0); }
    }
    .tutorial-pulse {
      animation: tutorial-pulse 1.4s ease-in-out infinite;
      outline: 2px solid rgba(99, 179, 237, 0.8);
      outline-offset: 2px;
    }
  `
  document.head.appendChild(style)
}

function removePulseStyle() {
  document.getElementById(PULSE_STYLE_ID)?.remove()
}

function observeBody(fn: () => void): MutationObserver {
  const obs = new MutationObserver(fn)
  obs.observe(document.body, { childList: true, subtree: true })
  return obs
}

export function trainingSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep, grantGold } = callbacks
  // Set to true when step [50] detects all stats capped. Step [52] care reads this
  // to jump directly to age (global 53), skipping the guarded training step entirely.
  let trainingComplete = false

  return [
    // ── [21] Training panel intro — page-load ─────────────────────────────────
    // waitForElement waits silently until the training panel renders after the
    // profile section transition.
    {
      element: '[data-tutorial="training-panel"]',
      waitForElement: 5000,
      popover: {
        title: "Training",
        description: "This is where you'll develop your horse's natural abilities through daily training.",
      },
    },

    // ── [22] Training potential — info ───────────────────────────────────────
    {
      element: '[data-tutorial="training-cap"]',
      disableActiveInteraction: true,
      popover: {
        title: "Training Potential",
        description: "Innate stats are genetic. They represent the natural ability a horse is born with. With training, a horse can normally develop each stat up to 1.5× its innate ability.",
      },
    },

    // ── [23] Training intensities — info ──────────────────────────────────────
    {
      element: '[data-tutorial="training-intensities"]',
      disableActiveInteraction: true,
      popover: {
        title: "Training Intensities",
        description: "Choose how hard your horse trains each day. Harder training is more effective but requires better Mood and Condition.",
      },
    },

    // ── [24] Blocked intense tier — info ──────────────────────────────────────
    {
      element: '[data-tutorial="training-intense-blocked"]',
      disableActiveInteraction: true,
      popover: {
        title: "Mood Requirement",
        description: "She has enough Condition for Intense training, but her Mood is too low. Let's groom her first.",
      },
    },

    // ── [25] Daily care panel — info ──────────────────────────────────────────
    {
      element: '[data-tutorial="daily-care-panel"]',
      disableActiveInteraction: true,
      popover: {
        title: "Daily Care",
        description: "Daily Care lets you improve and maintain your horse's wellbeing each day.",
      },
    },

    // ── [26] Groom action — action ────────────────────────────────────────────
    // advanceOnClick advances immediately on click; the next step uses
    // waitForElement to wait for the grooming log entry to appear.
    {
      element: '[data-tutorial="care-groom"]',
      advanceOnClick: true,
      popover: {
        title: "Start With Grooming",
        description: "Grooming is a good way to improve her Mood. Let's groom her before we continue training.",
        showButtons: [],
      },
    },

    // ── [27] Daily log after grooming — info ──────────────────────────────────
    // waitForElement waits for the grooming log entry to appear after the action.
    {
      element: '[data-tutorial="daily-log-care"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Daily Log",
        description: "You can see the results of your daily actions recorded here in the Daily Log.",
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        el.scrollIntoView({ block: "nearest" })
        setTimeout(() => ctrl.refresh(), 50)
      },
    },

    // ── [28] Mood improved — info ─────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-mood"]',
      disableActiveInteraction: true,
      popover: {
        title: "Feeling Better",
        description: "Grooming has improved her Mood, and she's now ready for Intense training.",
      },
    },

    // ── [29] Target stat — info ────────────────────────────────────────────────
    {
      element: '[data-tutorial="training-target-stat"]',
      disableActiveInteraction: true,
      popover: {
        title: "Ready to Train",
        description: "This is the stat with the most room to develop. Let's train it at Intense intensity.",
      },
    },

    // ── [30] Select intense tier — action ─────────────────────────────────────
    {
      element: '[data-tutorial="training-target-intense"]',
      popover: {
        title: "Select Intense",
        description: "Select the Intense tier to prepare for training.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 300)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => {
          el.removeEventListener("click", fn)
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [31] Train button — action ────────────────────────────────────────────
    {
      element: '[data-tutorial="training-target-train"]',
      popover: {
        title: "Intense Training",
        description: "Intense training requires more energy. Go ahead and train your mare.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 500)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => {
          el.removeEventListener("click", fn)
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [32] Training log entry — info ────────────────────────────────────────
    // waitForElement waits for the training log entry to appear after the action.
    {
      element: '[data-tutorial="daily-log-training"]',
      waitForElement: 5000,
      disableActiveInteraction: true,
      popover: {
        title: "Training Recorded",
        description: "Great work! You can see the training session logged here.",
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        el.scrollIntoView({ block: "nearest" })
        setTimeout(() => ctrl.refresh(), 50)
      },
    },

    // ── [33] Continue Training popup — info ──────────────────────────────────
    // onNextClick skips [34] if intense is already selected, so [34] never renders.
    {
      popover: {
        title: "Continue Training",
        description: "Let's continue our intense training session.",
        showButtons: ["next"],
        onNextClick: () => {
          const intenseBtn = document.querySelector('[data-tutorial="training-target-intense"]')
          if (intenseBtn?.getAttribute("data-tutorial-selected") === "true") {
            ctrl.moveTo(34) // Intense is already selected; skip its selection step.
          } else {
            ctrl.moveNext()
          }
        },
      },
    },

    // ── [34] Verify intense selected — action (only reached when not selected) ─
    {
      element: '[data-tutorial="training-target-intense"]',
      popover: {
        title: "Select Intense",
        description: "Make sure Intense is still selected before we continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          setTimeout(() => ctrl.moveNext(), 300)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => {
          el.removeEventListener("click", fn)
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [35] Repeat intense training x4 — action ─────────────────────────────
    // Single step that counts 4 trains before advancing. Non-intense tier buttons
    // are disabled so the user can't switch intensity mid-session. MutationObserver
    // re-applies both the pulse and the tier lock after each React re-render.
    {
      element: '[data-tutorial="training-target-stat"]',
      popover: {
        title: "Continue Training",
        description: "Let's continue our Intense training session.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false

        function lockOtherTiers() {
          const intense = document.querySelector<HTMLButtonElement>('[data-tutorial="training-target-intense"]')
          if (!intense) return
          intense.closest('div')?.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
            if (btn !== intense) btn.disabled = true
          })
        }

        function attachPulse() {
          if (advanced) return
          // The introductory session plus four repeats survive dashboard recovery.
          if (Number(el!.getAttribute("data-tutorial-training-sessions")) >= 5) {
            advanced = true
            setTimeout(() => ctrl.moveNext(), 500)
            return
          }
          lockOtherTiers()
          const trainBtn = document.querySelector<HTMLButtonElement>('[data-tutorial="training-target-train"]')
          if (!trainBtn || trainBtn.disabled) return
          injectPulseStyle()
          trainBtn.classList.add("tutorial-pulse")
          if ((trainBtn as any).__trainListener) return
          ;(trainBtn as any).__trainListener = true
          const fn = () => {
            trainBtn.classList.remove("tutorial-pulse")
            delete (trainBtn as any).__trainListener
            trainBtn.removeEventListener("click", fn)
            delete (trainBtn as any).__trainCleanup
          }
          trainBtn.addEventListener("click", fn)
          ;(trainBtn as any).__trainCleanup = () => {
            trainBtn.removeEventListener("click", fn)
            trainBtn.classList.remove("tutorial-pulse")
            delete (trainBtn as any).__trainListener
            delete (trainBtn as any).__trainCleanup
          }
        }

        const observer = observeBody(attachPulse)
        ;(el as any).__tutorialObserver = observer
        attachPulse()
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        const trainBtn = document.querySelector('[data-tutorial="training-target-train"]')
        const cleanup = (trainBtn as any)?.__trainCleanup as (() => void) | undefined
        if (cleanup) cleanup()
        // Restore tier buttons that were locked during this step.
        const intense = document.querySelector<HTMLButtonElement>('[data-tutorial="training-target-intense"]')
        intense?.closest('div')?.querySelectorAll<HTMLButtonElement>('button').forEach(btn => {
          if (btn !== intense) btn.disabled = false
        })
        removePulseStyle()
      },
    },

    // ── [36] Energy Is Running Low — info ─────────────────────────────────────
    {
      element: '[data-tutorial="stat-energy"]',
      disableActiveInteraction: true,
      popover: {
        title: "Energy Is Running Low",
        description: "Your mare is nearly out of Energy after all that training. Let's take care of her before we continue.",
      },
    },

    // ── [37] Keep Up With Daily Care — info ───────────────────────────────────
    {
      element: '[data-tutorial="daily-care-counter"]',
      disableActiveInteraction: true,
      popover: {
        title: "Keep Up With Daily Care",
        description: "Your mare still has care actions remaining today. Let's finish them before we continue.",
      },
    },

    // ── [38] Complete Her Care — action ───────────────────────────────────────
    // Pulses all remaining daily care Perform buttons. Advances when none remain.
    {
      element: '[data-tutorial="daily-care-actions"]',
      popover: {
        title: "Complete Her Care for the Day",
        description: "Finish the remaining care actions to keep her care up to date.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false

        function attachPulse() {
          if (advanced) return
          const buttons = document.querySelectorAll('[data-tutorial="daily-care-perform"]')
          if (buttons.length === 0) {
            advanced = true
            setTimeout(() => ctrl.moveNext(), 500)
            return
          }
          injectPulseStyle()
          buttons.forEach(btn => {
            if ((btn as any).__dcPulse) return
            btn.classList.add("tutorial-pulse")
            ;(btn as any).__dcPulse = true
            const fn = () => {
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__dcPulse
              btn.removeEventListener("click", fn)
              delete (btn as any).__dcCleanup
            }
            btn.addEventListener("click", fn)
            ;(btn as any).__dcCleanup = () => {
              btn.removeEventListener("click", fn)
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__dcPulse
              delete (btn as any).__dcCleanup
            }
          })
        }

        const observer = observeBody(attachPulse)
        ;(el as any).__tutorialObserver = observer
        attachPulse()
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        document.querySelectorAll('[data-tutorial="daily-care-perform"]').forEach(btn => {
          const cleanup = (btn as any).__dcCleanup as (() => void) | undefined
          if (cleanup) cleanup()
        })
        removePulseStyle()
      },
    },

    // ── [39] Use Light Training — action ──────────────────────────────────────
    // Spotlights the near-cap group (first 2 stats by tutorial animal config).
    // Re-pulses after each React re-render via MutationObserver. Advances after
    // 2 train completions. isNearCap gates the attributes so disabled/capped
    // stat buttons drop out of querySelectorAll automatically.
    {
      element: '[data-tutorial="training-near-cap-group"]',
      popover: {
        title: "Use Light Training",
        description: "These stats only need a little more training. Light intensity is the best choice to finish them.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false

        function attachPulse() {
          if (advanced) return
          const trainBtns = Array.from(el!.querySelectorAll('[data-tutorial="training-near-cap-train"]'))
          if (trainBtns.length === 0) {
            advanced = true
            setTimeout(() => ctrl.moveNext(), 500)
            return
          }

          injectPulseStyle()

          // Only pulse the light-tier button when it isn't already selected.
          // Clicking an already-selected tier is a no-op, so pulsing it misleads
          // the user into thinking that click advances the step.
          el!.querySelectorAll('[data-tutorial="training-light-tier"]').forEach(btn => {
            if (btn.classList.contains("bg-primary")) {
              btn.classList.remove("tutorial-pulse")
            } else {
              btn.classList.add("tutorial-pulse")
            }
          })

          trainBtns.forEach(btn => {
            const button = btn as HTMLButtonElement
            if (button.disabled) {
              button.classList.remove("tutorial-pulse")
              return
            }
            button.classList.add("tutorial-pulse")
            if ((button as any).__trainListener) return
            ;(button as any).__trainListener = true
            const fn = () => {
              button.classList.remove("tutorial-pulse")
              delete (button as any).__trainListener
              button.removeEventListener("click", fn)
              delete (button as any).__trainCleanup
            }
            button.addEventListener("click", fn)
            ;(button as any).__trainCleanup = () => {
              button.removeEventListener("click", fn)
              button.classList.remove("tutorial-pulse")
              delete (button as any).__trainListener
              delete (button as any).__trainCleanup
            }
          })
        }

        const observer = observeBody(attachPulse)
        ;(el as any).__tutorialObserver = observer
        attachPulse()
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        el?.querySelectorAll('[data-tutorial="training-light-tier"]').forEach(btn => {
          btn.classList.remove("tutorial-pulse")
        })
        el?.querySelectorAll('[data-tutorial="training-near-cap-train"]').forEach(btn => {
          const cleanup = (btn as any).__trainCleanup as (() => void) | undefined
          if (cleanup) cleanup()
        })
        removePulseStyle()
      },
    },

    // ── [40] Care Alert — info ─────────────────────────────────────────────────
    // waitForElement waits for the LTC overdue banner to appear after the grace period.
    {
      element: '[data-tutorial="ltc-alert"]',
      waitForElement: 10000,
      disableActiveInteraction: true,
      popover: {
        title: "Care Alerts",
        description: "A few things need attention. Your mare also has some routine care due. Let's take care of those before we finish for the day.",
      },
    },

    // ── [41] Long-Term Care section — info ────────────────────────────────────
    {
      element: '[data-tutorial="ltc-section"]',
      disableActiveInteraction: true,
      popover: {
        title: "Long-Term Care",
        description: "Some care isn't needed every day. When it's due, you'll find it here.",
      },
    },

    // ── [42] Care expenses gold grant — claim ─────────────────────────────────
    {
      element: '[data-tutorial="gold-balance"]',
      popover: {
        title: "Care Expenses",
        description: "Scheduling routine care costs Gold. Here's 100G to help cover your mare's care expenses.",
        showButtons: ["next"],
        onPopoverRender: (popover) => {
          popover.nextButton.textContent = "+ 100G"
          popover.nextButton.style.cssText += "; padding: 8px 20px; font-size: 14px; letter-spacing: 0.02em;"
        },
        onNextClick: () => {
          const btn = document.querySelector<HTMLButtonElement>("#driver-popover-content .driver-popover-next-btn")
          if (!btn || btn.disabled) return
          btn.disabled = true
          btn.textContent = "Adding…"
          grantGold(100)
            .catch((e) => console.error("[tutorial step 45] grantGold error:", e))
            .finally(() => setTimeout(() => ctrl.moveNext(), 800))
        },
      },
    },

    // ── [43] Complete Long-Term Care — action ─────────────────────────────────
    // Pulses all due LTC Perform buttons. Advances when none remain.
    {
      element: '[data-tutorial="ltc-section"]',
      popover: {
        title: "Complete Her Long-Term Care",
        description: "Book her Dentist and Farrier work so she's up to date.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false

        function attachPulse() {
          if (advanced) return
          const buttons = document.querySelectorAll('[data-tutorial="ltc-perform"]')
          if (buttons.length === 0) {
            advanced = true
            setTimeout(() => ctrl.moveNext(), 500)
            return
          }
          injectPulseStyle()
          buttons.forEach(btn => {
            if ((btn as any).__ltcPulse) return
            btn.classList.add("tutorial-pulse")
            ;(btn as any).__ltcPulse = true
            const fn = () => {
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__ltcPulse
              btn.removeEventListener("click", fn)
              delete (btn as any).__ltcCleanup
            }
            btn.addEventListener("click", fn)
            ;(btn as any).__ltcCleanup = () => {
              btn.removeEventListener("click", fn)
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__ltcPulse
              delete (btn as any).__ltcCleanup
            }
          })
        }

        const observer = observeBody(attachPulse)
        ;(el as any).__tutorialObserver = observer
        attachPulse()
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        document.querySelectorAll('[data-tutorial="ltc-perform"]').forEach(btn => {
          const cleanup = (btn as any).__ltcCleanup as (() => void) | undefined
          if (cleanup) cleanup()
        })
        removePulseStyle()
      },
    },

    // ── [44] Energy recap — info ──────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-energy"]',
      disableActiveInteraction: true,
      popover: {
        title: "Energy",
        description: "She's ready to rest. Her Energy is safely above threshold. Keeping her Energy up helps prevent overwork and exhaustion, which can put her at risk of injury.",
      },
    },

    // ── [45] Mood recap — info ────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-mood"]',
      disableActiveInteraction: true,
      popover: {
        title: "Mood",
        description: "She's feeling better. Grooming and daily care have improved her Mood.",
      },
    },

    // ── [46] Condition recap — info ───────────────────────────────────────────
    {
      element: '[data-tutorial="stat-condition"]',
      disableActiveInteraction: true,
      popover: {
        title: "Condition",
        description: "Her fitness is improving. Working your horse consistently improves her Condition and helps keep her fit for training and competition.",
      },
    },

    // ── [47] Care Score recap — info ──────────────────────────────────────────
    {
      element: '[data-tutorial="stat-care-score"]',
      disableActiveInteraction: true,
      popover: {
        title: "Care Score",
        description: "Her Care Score has improved. Keeping up with her daily and long-term care improves her Care Score over time.",
      },
    },

    // ── [48] Today's Progress — info ──────────────────────────────────────────
    {
      element: '[data-tutorial="daily-log-panel"]',
      disableActiveInteraction: true,
      popover: {
        title: "Today's Progress",
        description: "We've accomplished a lot today.",
      },
      onHighlighted: (el?: Element) => {
        if (el) el.scrollIntoView({ block: "nearest" })
        setTimeout(() => ctrl.refresh(), 50)
      },
    },

    // ── [49] Retire for the Night — action + checkpoint ───────────────────────
    {
      element: '[data-tutorial="advance-age"]',
      popover: {
        title: "Retire for the Night",
        description: "Your mare is finished for the day, so it's time to retire her for the night.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          completeStep("step_training_intro").catch(console.error)
          setTimeout(() => ctrl.moveNext(), 800)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => {
          el.removeEventListener("click", fn)
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [50] Day 2: Free Training — action ────────────────────────────────────
    // Watches data-energy-current only — no custom pulsing, game natively handles
    // button states. Two advance paths:
    //   energy < cheapest tier cost → moveNext() through Running Low + guarded training
    //   all stats capped (some energy remains) → moveTo(51) straight to care, skipping
    //   the misleading "Running Low" step and the no-op guarded training step.
    {
      element: '[data-tutorial="training-panel"]',
      popover: {
        title: "A Fresh Start",
        description: "Aging restores your horse's Energy and gives you a fresh chance to train. Go ahead and continue her training.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false

        function getEnergy(): number {
          const innate = document.querySelector<HTMLElement>('[data-tutorial="training-innate"]')
          return parseInt(innate?.getAttribute('data-energy-current') ?? '0', 10)
        }

        function getMinTierCost(): number {
          const costs = Array.from(document.querySelectorAll<HTMLElement>('[data-energy-cost]'))
            .map(b => parseInt(b.getAttribute('data-energy-cost') ?? '0', 10))
            .filter(c => c > 0)
          return costs.length > 0 ? Math.min(...costs) : 1
        }

        function allStatsCapped(): boolean {
          const btns = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button'))
          return btns.length > 0 && btns.every(b => b.disabled)
        }

        function check() {
          if (advanced) return
          const energy = getEnergy()
          if (energy < getMinTierCost()) {
            advanced = true
            completeStep("step_training_free").catch(console.error)
            setTimeout(() => ctrl.moveNext(), 500)  // → [51] Running Low
          } else if (allStatsCapped()) {
            advanced = true
            trainingComplete = true
            completeStep("step_training_free").catch(console.error)
            setTimeout(() => ctrl.moveTo(51), 500)  // → [52] Care (skips [51] + [53])
          }
        }

        const innate = document.querySelector<HTMLElement>('[data-tutorial="training-innate"]')
        if (innate) {
          const energyObs = new MutationObserver(() => {
            requestAnimationFrame(() => { if (!advanced) check() })
          })
          energyObs.observe(innate, { attributes: true, attributeFilter: ['data-energy-current'] })
          ;(el as any).__energyObserver = energyObs
        }

        check()
      },
      onDeselected: (el?: Element) => {
        const energyObs = (el as any)?.__energyObserver as MutationObserver | undefined
        if (energyObs) { energyObs.disconnect(); delete (el as any).__energyObserver }
      },
    },

    // ── [51] Energy bar — info ─────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-energy"]',
      disableActiveInteraction: true,
      popover: {
        title: "Running Low",
        description: "She's used most of her Energy. Daily care can restore some of it, so let's take care of her before continuing.",
        showButtons: ["next"],
      },
    },

    // ── [52] Care panel — action ───────────────────────────────────────────────
    // Spotlights the care panel. Pulses all remaining daily care perform buttons.
    // Advances automatically when no perform buttons remain.
    {
      element: '[data-tutorial="daily-care-panel"]',
      popover: {
        title: "Daily Care",
        description: "Complete her remaining daily care to restore her Energy and keep her feeling her best.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        let advanced = false
        const CARE_SEL = '[data-tutorial="daily-care-perform"], [data-tutorial="care-groom"]'

        function attachPulse() {
          if (advanced) return
          const buttons = document.querySelectorAll(CARE_SEL)
          if (buttons.length === 0) {
            advanced = true
            completeStep("step_care_day2").catch(console.error)
            if (trainingComplete) {
              trainingComplete = false
              setTimeout(() => ctrl.moveTo(53), 500)  // → [54] Age (skip [53] guarded training)
            } else {
              setTimeout(() => ctrl.moveNext(), 500)  // → [53] Guarded training
            }
            return
          }
          injectPulseStyle()
          buttons.forEach(btn => {
            if ((btn as any).__dcPulse) return
            btn.classList.add("tutorial-pulse")
            ;(btn as any).__dcPulse = true
            const fn = () => {
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__dcPulse
              btn.removeEventListener("click", fn)
              delete (btn as any).__dcCleanup
            }
            btn.addEventListener("click", fn)
            ;(btn as any).__dcCleanup = () => {
              btn.removeEventListener("click", fn)
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__dcPulse
              delete (btn as any).__dcCleanup
            }
          })
        }

        const observer = observeBody(attachPulse)
        ;(el as any).__tutorialObserver = observer
        attachPulse()
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        document.querySelectorAll('[data-tutorial="daily-care-perform"], [data-tutorial="care-groom"]').forEach(btn => {
          const cleanup = (btn as any).__dcCleanup as (() => void) | undefined
          if (cleanup) cleanup()
        })
        removePulseStyle()
      },
    },

    // ── [53] Guarded training — action ────────────────────────────────────────
    // Resumes training but guards against dropping below ENERGY_THRESHOLD.
    // Disables tier buttons and train buttons that would violate the threshold.
    // Advances when no training is viable (threshold reached or all stats capped).
    {
      element: '[data-tutorial="training-panel"]',
      popover: {
        title: "Continue Training",
        description: "She's ready to work again. Continue training until she's done for the day.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        const ENERGY_THRESHOLD = 20
        let advanced = false

        function getCurrentEnergy(): number {
          const innate = document.querySelector<HTMLElement>('[data-tutorial="training-innate"]')
          return parseInt(innate?.getAttribute('data-energy-current') ?? '0', 10)
        }

        function cleanupGuards() {
          document.querySelectorAll<HTMLButtonElement>('[data-energy-cost]').forEach(btn => {
            if ((btn as any).__tutorialGuarded) { btn.disabled = false; delete (btn as any).__tutorialGuarded }
          })
          document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button').forEach(btn => {
            if ((btn as any).__tutorialGuardedTrain) { btn.disabled = false; delete (btn as any).__tutorialGuardedTrain }
          })
        }

        // Applies energy threshold guards to tier buttons and train buttons.
        // Returns true when no training is viable.
        // Train button guard: locked if the currently selected tier (bg-primary) violates
        // the threshold — forcing the user to switch to a cheaper tier first.
        // Done check: no stat has any tier that passes the threshold.
        function applyGuardAndCheck(): boolean {
          if (advanced) return true
          const energy = getCurrentEnergy()

          // Lock tier buttons that would drop energy below threshold
          document.querySelectorAll<HTMLButtonElement>('[data-energy-cost]').forEach(btn => {
            const cost = parseInt(btn.getAttribute('data-energy-cost') ?? '0', 10)
            const reactDisabled = btn.disabled && !(btn as any).__tutorialGuarded
            if (reactDisabled) return
            if (energy - cost < ENERGY_THRESHOLD) {
              if (!(btn as any).__tutorialGuarded) { btn.disabled = true; ;(btn as any).__tutorialGuarded = true }
            } else if ((btn as any).__tutorialGuarded) {
              btn.disabled = false; delete (btn as any).__tutorialGuarded
            }
          })

          // Per-stat: check selected tier vs guard, and whether any tier is viable
          const trainSpans = document.querySelectorAll<HTMLSpanElement>('[data-tutorial-train="true"]')
          if (trainSpans.length === 0) return false // DOM not rendered yet — don't treat as done
          let anyViable = false
          trainSpans.forEach(trainSpan => {
            const trainBtn = trainSpan.querySelector<HTMLButtonElement>('button')
            if (!trainBtn) return
            if (trainBtn.disabled && !(trainBtn as any).__tutorialGuardedTrain) return // React-locked (at cap etc.)

            const statCard = trainSpan.parentElement
            const tierBtns = statCard ? Array.from(statCard.querySelectorAll<HTMLButtonElement>('[data-energy-cost]')) : []

            // Selected tier = the one with bg-primary class
            const selectedTierBtn = tierBtns.find(b => b.classList.contains('bg-primary'))
            const selectedCost = selectedTierBtn ? parseInt(selectedTierBtn.getAttribute('data-energy-cost') ?? '0', 10) : 0
            const selectedPassesGuard = selectedCost === 0 || energy - selectedCost >= ENERGY_THRESHOLD

            // Any viable tier = any tier not React-locked that passes the threshold
            const hasViableTier = tierBtns.some(b => {
              if (b.disabled && !(b as any).__tutorialGuarded) return false
              const cost = parseInt(b.getAttribute('data-energy-cost') ?? '0', 10)
              return energy - cost >= ENERGY_THRESHOLD
            })

            // Lock train button only when the selected tier violates the threshold
            if (!selectedPassesGuard) {
              if (!(trainBtn as any).__tutorialGuardedTrain) { trainBtn.disabled = true; ;(trainBtn as any).__tutorialGuardedTrain = true }
            } else {
              if ((trainBtn as any).__tutorialGuardedTrain) { trainBtn.disabled = false; delete (trainBtn as any).__tutorialGuardedTrain }
            }

            if (hasViableTier) anyViable = true
          })

          return !anyViable
        }

        // checkDone=true only after a click settles — never from the MutationObserver,
        // which can fire during transient React re-renders where buttons are momentarily disabled.
        function attachPulse(checkDone = false) {
          if (advanced) return
          const done = checkDone ? applyGuardAndCheck() : (applyGuardAndCheck(), false)
          if (done) {
            advanced = true
            cleanupGuards()
            completeStep("step_training_guarded").catch(console.error)
            setTimeout(() => ctrl.moveNext(), 500)
            return
          }
          document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button').forEach(btn => {
            if (btn.disabled && !(btn as any).__tutorialGuardedTrain && (btn as any).__trainCleanup) (btn as any).__trainCleanup()
          })
          const trainBtns = Array.from(
            document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button')
          ).filter(b => !b.disabled)
          injectPulseStyle()
          trainBtns.forEach(btn => {
            if ((btn as any).__trainListener) return
            btn.classList.add("tutorial-pulse")
            ;(btn as any).__trainListener = true
            const fn = () => {
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__trainListener
              btn.removeEventListener("click", fn)
              delete (btn as any).__trainCleanup
              setTimeout(() => attachPulse(true), 800)
            }
            btn.addEventListener("click", fn)
            ;(btn as any).__trainCleanup = () => {
              btn.removeEventListener("click", fn)
              btn.classList.remove("tutorial-pulse")
              delete (btn as any).__trainListener
              delete (btn as any).__trainCleanup
            }
          })
        }

        const observer = observeBody(() => attachPulse(false))
        ;(el as any).__tutorialObserver = observer
        attachPulse(true)
      },
      onDeselected: (el?: Element) => {
        const observer = (el as any)?.__tutorialObserver as MutationObserver | undefined
        if (observer) { observer.disconnect(); delete (el as any).__tutorialObserver }
        document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button').forEach(btn => {
          const cleanup = (btn as any).__trainCleanup as (() => void) | undefined
          if (cleanup) cleanup()
        })
        document.querySelectorAll<HTMLButtonElement>('[data-energy-cost]').forEach(btn => {
          if ((btn as any).__tutorialGuarded) { btn.disabled = false; delete (btn as any).__tutorialGuarded }
        })
        document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button').forEach(btn => {
          if ((btn as any).__tutorialGuardedTrain) { btn.disabled = false; delete (btn as any).__tutorialGuardedTrain }
        })
        removePulseStyle()
      },
    },

    // ── [54] End of Day — action ───────────────────────────────────────────────
    // After guarded training ends, check whether training is truly complete (all
    // stats at cap) or was only stopped by the energy threshold. If at cap, advance
    // to the next phase. If threshold-limited, loop back to [50] for another day.
    {
      element: '[data-tutorial="advance-age"]',
      popover: {
        title: "Time to Rest",
        description: "She's done enough for now. Age her when you're ready to continue.",
        showButtons: [],
      },
      onHighlighted: (el?: Element) => {
        if (!el) return
        // Guards are cleared by [53]'s onDeselected, so disabled = React state only.
        // All disabled → all stats capped. Any enabled → threshold stopped us.
        const trainingComplete = Array.from(
          document.querySelectorAll<HTMLButtonElement>('[data-tutorial-train="true"] > button')
        ).every(b => b.disabled)

        injectPulseStyle()
        el.classList.add("tutorial-pulse")
        const fn = () => {
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
          el.removeEventListener("click", fn)
          delete (el as any).__tutorialCleanup
          completeStep("step_day2_retire").catch(console.error)
          setTimeout(() => {
            if (trainingComplete) {
              ctrl.moveNext()
            } else {
              ctrl.moveTo(49)
            }
          }, 800)
        }
        el.addEventListener("click", fn)
        ;(el as any).__tutorialCleanup = () => {
          el.removeEventListener("click", fn)
          el.classList.remove("tutorial-pulse")
          removePulseStyle()
        }
      },
      onDeselected: (el?: Element) => {
        const cleanup = (el as any)?.__tutorialCleanup as (() => void) | undefined
        if (cleanup) { cleanup(); delete (el as any).__tutorialCleanup }
      },
    },

    // ── [55] Training complete — info ──────────────────────────────────────────
    // Only reached when all stats hit cap (trainingComplete = true in [54]).
    {
      popover: {
        title: "Training Complete",
        description: "She's finished developing her stats and is another step closer to being ready for breeding. Let's take a look at her competition progress.",
        showButtons: ["next"],
        onNextClick: () => {
          completeStep("step_training_complete").catch(console.error)
          ctrl.moveNext()
        },
      },
    },

    // ── [56] Competition transition — info ────────────────────────────────────
    {
      element: '[data-tutorial="competition-panel"]',
      disableActiveInteraction: true,
      popover: {
        title: "Competition Progress",
        description: "Before we can review her competition progress, there's something to take care of first. When a horse isn't eligible to compete, this panel will show you what's missing.",
        showButtons: ["next"],
        onNextClick: () => {
          completeStep("step_competition_transition").catch(console.error)
          ctrl.moveNext()
        },
      },
    },
  ]
}
