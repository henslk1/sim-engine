import { createFileRoute, Link } from "@tanstack/react-router"
import { trpc, type RouterOutputs } from "@/lib/trpc"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ChevronDown, ChevronRight, RotateCcw } from "lucide-react"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/analytics")({
  component: OpsAnalytics,
})

type TaskType = "NIGHTLY" | "COMPETITION_SWEEP" | "SHOP_ROTATION"

/**
 * The two task types count completely different things, and sharing one set of
 * labels between them was actively misleading — a sweep's `eligibleCount` is
 * expired competitions, and reading it under "animals interacted with" claimed
 * 571 animals were due to age when none were.
 */
const TASK_VOCAB = {
  NIGHTLY: {
    label: "Nightly update",
    /** What this task processes, for rates and column headings. */
    unit: "animals",
    eligibleLabel: "Eligible",
    eligibleHint: "animals interacted with",
    doneLabel: "Aged",
    /** Only the nightly has a per-animal work queue behind it. */
    hasWorkQueue: true,
  },
  COMPETITION_SWEEP: {
    label: "Competition sweep",
    unit: "competitions",
    eligibleLabel: "Past deadline",
    eligibleHint: "open competitions",
    // Not "Resolved". A sweep writes work down and returns; resolving happens
    // afterwards, on the resolver, and is reported below by the queue itself.
    doneLabel: "Enqueued",
    hasWorkQueue: false,
  },
  SHOP_ROTATION: {
    label: "Shop rotation",
    unit: "animals",
    eligibleLabel: "Cleared",
    eligibleHint: "unsold stock removed",
    doneLabel: "Restocked",
    hasWorkQueue: false,
  },
} satisfies Record<TaskType, unknown>

const STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  RUNNING: "bg-primary/15 text-primary",
  RETRYING: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  COMPLETED: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  FAILED: "bg-destructive/15 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground/70",
}

/** A duration a person can read at a glance, not a unit-correct one. */
function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—"
  if (ms < 1000) return `${Math.round(ms)}ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${rest}s`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatRate(rate: number | null | undefined): string {
  if (rate == null) return "—"
  if (rate === 0) return "0/s"
  return rate < 1 ? `${rate.toFixed(2)}/s` : `${rate.toFixed(1)}/s`
}

function formatClock(value: Date | string | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function Stat({ label, value, hint, tone }: {
  label: string
  value: string
  hint?: string
  tone?: "default" | "warn" | "bad"
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn(
        "mt-0.5 text-xl font-semibold tabular-nums",
        tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-foreground",
      )}>
        {value}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Block({ title, aside, children }: {
  title: string
  aside?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

/**
 * Throughput over the life of a run, drawn from the progress samples.
 *
 * Each point is the rate between two consecutive samples rather than the
 * running average, because the question this answers is whether the run is
 * speeding up or collapsing — an average hides exactly that.
 */
function ThroughputChart({ samples, unit }: {
  samples: Array<{ recordedAt: Date | string; succeededTotal: number; activeWorkers: number }>
  unit: string
}) {
  if (samples.length < 2) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 text-center text-xs text-muted-foreground">
        A rate needs two samples. One is recorded per chunk of {unit}, so short runs finish before the curve exists.
      </div>
    )
  }

  const points: Array<{ t: number; rate: number }> = []
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!
    const curr = samples[i]!
    const seconds = (new Date(curr.recordedAt).getTime() - new Date(prev.recordedAt).getTime()) / 1000
    if (seconds <= 0) continue
    points.push({
      t: (new Date(curr.recordedAt).getTime() - new Date(samples[0]!.recordedAt).getTime()) / 1000,
      rate: (curr.succeededTotal - prev.succeededTotal) / seconds,
    })
  }

  if (points.length === 0) return null

  const W = 600
  const H = 120
  const PAD = 8
  const maxT = Math.max(...points.map(p => p.t), 1)
  const maxRate = Math.max(...points.map(p => p.rate), 1)

  const x = (t: number) => PAD + (t / maxT) * (W - PAD * 2)
  const y = (rate: number) => H - PAD - (rate / maxRate) * (H - PAD * 2)

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.rate).toFixed(1)}`).join(" ")
  const area = `${line} L${x(points[points.length - 1]!.t).toFixed(1)},${H - PAD} L${x(points[0]!.t).toFixed(1)},${H - PAD} Z`

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-28 w-full">
        <path d={area} className="fill-primary/15" />
        <path d={line} className="stroke-primary" fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] tabular-nums text-muted-foreground">
        <span>0s</span>
        <span>peak {formatRate(maxRate)}</span>
        <span>{Math.round(maxT)}s</span>
      </div>
    </div>
  )
}

type Detail = NonNullable<RouterOutputs["admin"]["ops"]["analytics"]["run"]>

/** Everything about one run, below its row in the list. */
function RunDetail({ detail, vocab, gameId }: {
  detail: Detail
  vocab: (typeof TASK_VOCAB)[TaskType]
  gameId: string
}) {
  const utils = trpc.useUtils()
  const retryFailed = trpc.admin.ops.analytics.retryFailed.useMutation({
    onSuccess: () => {
      utils.admin.ops.analytics.run.invalidate()
      utils.admin.ops.analytics.runs.invalidate()
    },
  })

  const retryResolutions = trpc.admin.ops.analytics.retryResolutions.useMutation({
    onSuccess: () => utils.admin.ops.analytics.run.invalidate(),
  })

  const work = detail.work
  const progressTotal = vocab.hasWorkQueue ? work.total : 0
  const pct = (n: number) => (progressTotal > 0 ? (n / progressTotal) * 100 : 0)

  return (
    <div className="space-y-4 border-t border-border bg-muted/30 p-4">
      {detail.run.errorMessage && (
        <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          {detail.run.errorMessage}
        </p>
      )}

      {progressTotal > 0 && (
        <div>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-emerald-500" style={{ width: `${pct(work.completed)}%` }} />
            <div className="bg-primary" style={{ width: `${pct(work.running)}%` }} />
            <div className="bg-amber-500" style={{ width: `${pct(work.retrying)}%` }} />
            <div className="bg-destructive" style={{ width: `${pct(work.failed)}%` }} />
          </div>
          <div className="mt-1.5 flex flex-wrap justify-between gap-x-4 text-[11px] tabular-nums text-muted-foreground">
            <span>{work.completed.toLocaleString()} of {progressTotal.toLocaleString()} {vocab.unit} done</span>
            {detail.estimatedCompletionAt && <span>est. finish {formatClock(detail.estimatedCompletionAt)}</span>}
          </div>
        </div>
      )}

      {vocab.hasWorkQueue ? (
        <>
          {detail.run.detailPrunedAt && (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
              Per-animal detail for this run was cleared on{" "}
              <span className="text-foreground">{formatClock(detail.run.detailPrunedAt)}</span>.
              The totals, rates and timing below are the summary kept when it finished; the
              progress curve, the per-animal list and the failure detail are not retained.
            </div>
          )}

          <Block title={`Throughput (${vocab.unit} per second)`}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Current"
                value={formatRate(detail.rates.current)}
                hint={detail.isLive ? "last few chunks" : "run has stopped"}
              />
              <Stat label="Average" value={formatRate(detail.rates.average)} hint="per wall-clock second" />
              <Stat label="Peak" value={formatRate(detail.rates.peak)} hint="best chunk" />
              <Stat
                label="Per worker"
                value={formatRate(detail.rates.processing)}
                hint={`${detail.activeWorkers} worker${detail.activeWorkers === 1 ? "" : "s"} · ${formatDuration(detail.rates.workerSeconds * 1000)}`}
              />
            </div>
            <div className="mt-3">
              <ThroughputChart samples={detail.samples} unit={vocab.unit} />
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
             </p>
          </Block>

          {detail.timing && (
            <Block
              title="Per-animal time"
              aside={
                <span className="text-[11px] text-muted-foreground">
                  {detail.timing.measured.toLocaleString()} measured
                </span>
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Median" value={formatDuration(detail.timing.p50Ms)} hint="half were faster" />
                <Stat label="p95" value={formatDuration(detail.timing.p95Ms)} hint="slowest 1 in 20" />
                <Stat label="p99" value={formatDuration(detail.timing.p99Ms)} hint="slowest 1 in 100" />
                <Stat
                  label="Slowest"
                  value={formatDuration(detail.timing.maxMs)}
                  hint={`fastest ${formatDuration(detail.timing.minMs)}`}
                />
              </div>

              {detail.slowest.length === 0 && detail.run.detailPrunedAt && (
                <p className="mt-3 text-[11px] text-muted-foreground">
                  The per-animal list is part of the cleared detail. The distribution above was
                  finalized before it went.
                </p>
              )}

              {detail.slowest.length > 0 && (
                <div className="mt-3 rounded-lg border border-border bg-background p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Slowest animals
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {detail.slowest.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-3">
                        <Link
                          to="/animal/$animalId"
                          params={{ animalId: item.animalId }}
                          className="truncate text-foreground hover:underline"
                        >
                          {item.animalName}
                        </Link>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatDuration(item.durationMs)}
                          {item.attempt > 1 && ` · attempt ${item.attempt}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Successful attempts only. Elapsed time per animal under the run's own
                concurrency, so these rank animals against each other within this run rather
                than giving an isolated cost.
              </p>
            </Block>
          )}

          <Block title="Work">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={vocab.eligibleLabel} value={detail.run.eligibleCount.toLocaleString()} hint={vocab.eligibleHint} />
              <Stat label="Completed" value={work.completed.toLocaleString()} />
              <Stat
                label="Remaining"
                value={work.remaining.toLocaleString()}
                tone={work.remaining > 0 && !detail.isLive ? "warn" : "default"}
              />
              <Stat
                label="Failed"
                value={work.failed.toLocaleString()}
                tone={work.failed > 0 ? "bad" : "default"}
              />
              <Stat label="Skipped" value={detail.run.skippedCount.toLocaleString()} hint="living, untouched" />
              <Stat
                label="Retried"
                value={detail.retriedItems.toLocaleString()}
                hint="needed more than one try"
                tone={detail.retriedItems > 0 ? "warn" : "default"}
              />
            </div>

            {detail.oldestUnfinished && (
              <div className="mt-3 rounded-lg border border-border bg-background p-3 text-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Oldest unfinished
                </span>
                <p className="mt-1 text-foreground">
                  {detail.oldestUnfinished.animalName}
                  <span className="text-muted-foreground">
                    {" "}— {detail.oldestUnfinished.status.toLowerCase()}, waiting{" "}
                    {formatDuration(detail.oldestUnfinished.waitingMs)}
                    {detail.oldestUnfinished.attempt > 1 && `, attempt ${detail.oldestUnfinished.attempt}`}
                    {detail.oldestUnfinished.claimedBy && ` · ${detail.oldestUnfinished.claimedBy}`}
                  </span>
                </p>
              </div>
            )}
          </Block>

          <Block title="Outcomes">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Aged" value={detail.outcomes.animalsAged?.toLocaleString() ?? "—"} />
              <Stat label="Deaths" value={detail.outcomes.animalDeaths?.toLocaleString() ?? "—"} />
              <Stat label="Life stages" value={detail.outcomes.lifeStageTransitions?.toLocaleString() ?? "—"} hint="advanced" />
              <Stat label="Pregnancies" value={detail.outcomes.pregnanciesCompleted.toLocaleString()} hint="came to term" />
            </div>
            {detail.outcomes.animalsAged == null && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                No nightly log is linked to this run — runs from before the log was linked have none.
              </p>
            )}
          </Block>

          {detail.failures.length > 0 && (
            <Block
              title={`Failures (${detail.failures.length})`}
              aside={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={retryFailed.isPending || detail.run.status === "RUNNING"}
                  onClick={() => retryFailed.mutate({ gameId, runId: detail.run.id })}
                >
                  <RotateCcw className="size-3.5" />
                  Retry failed work
                </Button>
              }
            >
              <div className="overflow-hidden rounded-lg border border-border bg-background">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Animal</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tries</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.failures.map(f => (
                      <tr key={f.id} className="border-t border-border">
                        <td className="px-3 py-2">{f.animalName}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.attempt}</td>
                        <td className="px-3 py-2 text-xs text-destructive">{f.errorMessage ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {retryFailed.error && <p className="mt-1.5 text-xs text-destructive">{retryFailed.error.message}</p>}
              {retryFailed.data && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {retryFailed.data.requeued} animal(s) requeued. The scheduler picks the run up on its next tick.
                </p>
              )}
            </Block>
          )}
        </>
      ) : (
        /* A sweep has no work queue of its own, no samples and no population
           outcomes. It finds the competitions whose deadline has passed, writes
           them down and returns - so what it did is two numbers, and what came
           of it is the block below. */
        <>
          <Block title="This sweep">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label={vocab.eligibleLabel} value={detail.run.eligibleCount.toLocaleString()} hint={vocab.eligibleHint} />
              <Stat
                label="Enqueued"
                value={detail.run.succeededCount.toLocaleString()}
                hint={
                  detail.run.succeededCount < detail.run.eligibleCount
                    ? `${(detail.run.eligibleCount - detail.run.succeededCount).toLocaleString()} were already queued`
                    : "handed to the resolver"
                }
              />
              <Stat label="Took" value={formatDuration(detail.elapsedMs)} hint="finding and queueing" />
            </div>
          </Block>

          {detail.resolution && (
            <Block
              title="What the resolver did with it"
              aside={
                detail.resolution.gameFailed > 0 ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retryResolutions.isPending}
                    onClick={() => retryResolutions.mutate({ gameId })}
                  >
                    <RotateCcw className="size-3.5" />
                    Retry {detail.resolution.gameFailed} failed in this game
                  </Button>
                ) : undefined
              }
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label="Resolved"
                  value={detail.resolution.counts.completed.toLocaleString()}
                  hint={`of ${detail.resolution.enqueued.toLocaleString()} this sweep queued`}
                />
                <Stat
                  label="Waiting"
                  value={detail.resolution.waiting.toLocaleString()}
                  hint={detail.resolution.waiting > 0 ? "still to run" : "queue drained"}
                  tone={detail.resolution.waiting > 0 ? "warn" : "default"}
                />
                <Stat
                  label="Took"
                  value={formatDuration(detail.resolution.durationMs)}
                  hint={detail.resolution.finishedAt ? "start to last result" : "so far"}
                />
                <Stat label="Rate" value={formatRate(detail.resolution.ratePerSecond)} hint="competitions/second" />
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat
                  label="Picked up after"
                  value={formatDuration(detail.resolution.queueLatencyMs)}
                  hint="sweep start to first claim"
                />
                <Stat
                  label="Retrying"
                  value={detail.resolution.counts.retrying.toLocaleString()}
                  tone={detail.resolution.counts.retrying > 0 ? "warn" : "default"}
                />
                <Stat
                  label="Given up"
                  value={detail.resolution.counts.failed.toLocaleString()}
                  tone={detail.resolution.counts.failed > 0 ? "bad" : "default"}
                />
              </div>

              {detail.resolution.counts.cancelled > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {detail.resolution.counts.cancelled.toLocaleString()} were cancelled before they could run, and were
                  not judged.
                </p>
              )}

              <p className="mt-1.5 text-[11px] text-muted-foreground">
                This sweep&rsquo;s own work only. A competition that filled up and queued itself belongs to no sweep and
                is not counted here.
              </p>

              {detail.resolution.failures.length > 0 && (
                <div className="mt-3 overflow-hidden rounded-lg border border-border bg-background">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-secondary/40">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Competition</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Tries</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.resolution.failures.map(f => (
                        <tr key={f.id} className="border-t border-border">
                          <td className="px-3 py-2">{f.name}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{f.attempt}</td>
                          <td className={cn("px-3 py-2 text-xs", f.status === "FAILED" ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                            {f.errorMessage ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {retryResolutions.data && (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {retryResolutions.data.requeued} competition(s) requeued.
                </p>
              )}
            </Block>
          )}
        </>
      )}

      {detail.comparison && (
        <Block title={`Against the last ${detail.comparison.runs} completed run(s)`}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat
              label="Duration"
              value={formatDuration(detail.comparison.averageDurationMs)}
              hint={detail.elapsedMs != null ? `this run ${formatDuration(detail.elapsedMs)}` : undefined}
            />
            <Stat
              label={vocab.unit === "animals" ? "Animals" : "Competitions"}
              value={Math.round(detail.comparison.averageSucceeded).toLocaleString()}
              hint={`this run ${(vocab.hasWorkQueue ? work.completed : detail.run.succeededCount).toLocaleString()}`}
            />
            <Stat
              label="Rate"
              value={formatRate(detail.comparison.averageRate)}
              hint={`this run ${formatRate(detail.rates.average)}`}
            />
          </div>
        </Block>
      )}
    </div>
  )
}

function OpsAnalytics() {
  const { gameId } = Route.useParams()

  const [taskType, setTaskType] = useState<TaskType>("NIGHTLY")
  // `undefined` means nothing has been chosen, so the newest run opens by
  // itself; `null` means it was deliberately collapsed. Keeping those apart is
  // what lets a new run take over the open slot without overriding a choice.
  const [chosen, setChosen] = useState<string | null | undefined>(undefined)

  const vocab = TASK_VOCAB[taskType]

  const { data: runs = [] } = trpc.admin.ops.analytics.runs.useQuery(
    { gameId: gameId!, taskType, limit: 25 },
    { refetchInterval: 15_000 },
  )

  const expandedId = chosen === undefined ? runs[0]?.id : (chosen ?? undefined)

  const { data: detail } = trpc.admin.ops.analytics.run.useQuery(
    { gameId: gameId!, taskType, ...(expandedId && { runId: expandedId }) },
    {
      enabled: Boolean(expandedId),
      // A run that is still going is worth watching; a finished one is not
      // worth a request every few seconds.
      // A sweep finishes in seconds and its queue drains for minutes, so the
      // run being over is not the end of anything worth watching.
      refetchInterval: (query) =>
        query.state.data?.isLive || query.state.data?.isSettling ? 3_000 : false,
    },
  )

  function switchTask(type: TaskType) {
    setTaskType(type)
    setChosen(undefined)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-xl font-semibold text-foreground">Scheduled Work</h1>
        <div className="flex gap-1">
          {(Object.keys(TASK_VOCAB) as TaskType[]).map(type => (
            <button
              key={type}
              onClick={() => switchTask(type)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                taskType === type
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {TASK_VOCAB[type].label}
            </button>
          ))}
        </div>
      </div>

      {runs.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          This game has no {vocab.label.toLowerCase()} runs yet. One appears the first time the scheduler reaches a
          boundary for it.
        </p>
      ) : (
        <div className="space-y-2">
          {runs.map(run => {
            const open = run.id === expandedId
            const done = run.nightlyLog?.animalsAged ?? run.succeededCount
            const Chevron = open ? ChevronDown : ChevronRight

            return (
              <div
                key={run.id}
                className={cn(
                  "overflow-hidden rounded-lg border bg-card transition-colors",
                  open ? "border-primary/40" : "border-border",
                )}
              >
                <button
                  onClick={() => setChosen(open ? null : run.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
                >
                  <Chevron className="size-4 shrink-0 text-muted-foreground" />
                  <span className="shrink-0 tabular-nums">{formatClock(run.scheduledFor)}</span>
                  <span className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    STATUS_STYLES[run.status] ?? "bg-muted text-muted-foreground",
                  )}>
                    {run.status}
                  </span>
                  <span className="ml-auto flex shrink-0 items-baseline gap-4 text-xs tabular-nums text-muted-foreground">
                    <span>{formatDuration(run.durationMs)}</span>
                    <span className="text-foreground">
                      {done.toLocaleString()} <span className="text-muted-foreground">{vocab.doneLabel.toLowerCase()}</span>
                    </span>
                    <span>{formatRate(run.wallClockRate)}</span>
                    <span className={run.failedCount > 0 ? "font-semibold text-destructive" : undefined}>
                      {run.failedCount} failed
                    </span>
                  </span>
                </button>

                {open && (
                  detail && detail.run.id === run.id ? (
                    <RunDetail detail={detail} vocab={vocab} gameId={gameId!} />
                  ) : (
                    <div className="border-t border-border bg-muted/30 p-4">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        {[0, 1, 2, 3].map(i => (
                          <div key={i} className="h-[74px] animate-pulse rounded-lg border border-border bg-background" />
                        ))}
                      </div>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
