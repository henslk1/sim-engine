import type { DriveStep } from "driver.js"
import type { TutorialCallbacks, TutorialCtrl } from "../types"

export function profileSteps(ctrl: TutorialCtrl, callbacks: TutorialCallbacks): DriveStep[] {
  const { completeStep } = callbacks

  return [
    // ── [11] Profile intro — floating ──────────────────────────────────────────
    {
      popover: {
        title: "Your Horse's Profile",
        description: "This is where you'll manage your horse from day to day. You'll return here often as you care for her, develop her, and prepare her for breeding.",
      },
    },

    // ── [12] Animal info strip — info ─────────────────────────────────────────
    {
      element: '[data-tutorial="animal-header"]',
      disableActiveInteraction: true,
      popover: {
        title: "Horse Information",
        description: "The header and info strip keep your horse's important information in one place, including her details, accolades, and any alerts that need your attention.",
      },
    },

    // ── [13] Breeding grade — info ─────────────────────────────────────────────
    {
      element: '[data-tutorial="breeding-grade"]',
      disableActiveInteraction: true,
      popover: {
        title: "Breeding Grade",
        description: "Breeding Grade reflects how well prepared a horse is for breeding. As you develop and care for your mare, you'll see her Breeding Grade improve. A stronger Breeding Grade can contribute to better-quality offspring.",
      },
    },

    // ── [14] Energy — info ─────────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-energy"]',
      disableActiveInteraction: true,
      popover: {
        title: "Energy",
        description: "Energy is spent on activities such as training and competition. A healthy horse will have its Energy replenished every night.",
      },
    },

    // ── [15] Mood — info ───────────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-mood"]',
      disableActiveInteraction: true,
      popover: {
        title: "Mood",
        description: "Mood affects what your horse is willing to do and can limit certain activities when it becomes too low. Personality can also affect how tolerant a horse is.",
      },
    },

    // ── [16] Condition — info ──────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-condition"]',
      disableActiveInteraction: true,
      popover: {
        title: "Condition",
        description: "Condition reflects your horse's physical fitness and readiness for work. Consistent training and competition help maintain it, while inactivity can cause it to decline.",
      },
    },

    // ── [17] Care score — info ─────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-care-score"]',
      disableActiveInteraction: true,
      popover: {
        title: "Care Score",
        description: "Care Score reflects the quality of your horse's care over time, not just what you've done today.",
      },
    },

    // ── [18] Immunity — info ───────────────────────────────────────────────────
    {
      element: '[data-tutorial="stat-immunity"]',
      disableActiveInteraction: true,
      popover: {
        title: "Immunity",
        description: "Immunity represents your horse's natural resistance to illness. Higher Immunity helps her stay healthier over time.",
      },
    },

    // ── [19] Owner actions — info ──────────────────────────────────────────────
    {
      element: '[data-tutorial="owner-actions"]',
      disableActiveInteraction: true,
      popover: {
        title: "Stable Management",
        description: "This is where you'll find additional management options for your horse.",
      },
    },

    // ── [20] Transition — info + checkpoint ────────────────────────────────────
    {
      popover: {
        title: "Let's Get Her Ready",
        description: "Now that you know your way around her profile, it's time to start preparing her for breeding. We'll begin with her training.",
        showButtons: ["next"],
        onNextClick: () => {
          completeStep("step_mare_profile").catch(console.error)
          ctrl.moveNext()
        },
      },
    },
  ]
}
