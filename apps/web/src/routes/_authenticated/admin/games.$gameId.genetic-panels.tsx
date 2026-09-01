import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ChevronDown, ChevronRight } from "lucide-react"
import { RichTextEditor } from "@/components/game/editor/RichTextEditor"

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/genetic-panels")({
  component: GeneticPanelsPage,
})

// ── Types ─────────────────────────────────────────────────────────────────────

type PanelForm = {
  id?: string
  name: string
  panelType: "HEALTH" | "CONFORMATION" | "COLOR"
  colorRole: string | null
}

type LocusCreateForm = {
  name: string
  biasTarget: "FAVORABILITY" | "RARITY" | "NONE"
  minTestCycle: string
  description: object | null
}

type RuleForm = {
  id?: string
  alleleOneId: string
  alleleTwoId: string
  phenotype: string
  numericModifier: string
}

const emptyPanel = (): PanelForm => ({ name: "", panelType: "HEALTH", colorRole: null })
const emptyLocusCreate = (): LocusCreateForm => ({ name: "", biasTarget: "NONE", minTestCycle: "", description: null })
const emptyRule = (): RuleForm => ({ alleleOneId: "", alleleTwoId: "", phenotype: "", numericModifier: "" })

type PLinkForm = { phenotype: string; healthConditionDefId: string; environmentalRiskModifier: string; penetrance: string }
const emptyPLinkForm = (): PLinkForm => ({ phenotype: "", healthConditionDefId: "", environmentalRiskModifier: "0", penetrance: "" })

// ── Field label ───────────────────────────────────────────────────────────────

function FL({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  )
}

// ── Locus Editor ──────────────────────────────────────────────────────────────

type LocusRecord = {
  id: string
  name: string
  biasTarget: "FAVORABILITY" | "RARITY" | "NONE"
  minTestCycle: number | null
  description: unknown
  isHiddenModifier: boolean
  inheritanceWeight: number
}

function LocusEditor({ locus, gameId }: { locus: LocusRecord; gameId: string }) {
  const locusId = locus.id
  const utils = trpc.useUtils()
  const { data: alleles } = trpc.admin.locus.listAlleles.useQuery({ locusId })
  const { data: rules } = trpc.admin.expression.listByLocus.useQuery({ locusId })

  const saveAllele = trpc.admin.locus.saveAllele.useMutation({
    onSuccess: () => {
      utils.admin.locus.listAlleles.invalidate({ locusId })
      utils.admin.locus.list.invalidate()
      setNewSymbol("")
      setEditingAlleleId(null)
    },
  })
  const removeAllele = trpc.admin.locus.removeAllele.useMutation({
    onSuccess: () => {
      utils.admin.locus.listAlleles.invalidate({ locusId })
      utils.admin.locus.list.invalidate()
    },
  })
  const saveRule = trpc.admin.expression.save.useMutation({
    onSuccess: () => { utils.admin.expression.listByLocus.invalidate({ locusId }); setEditingRule(null) },
  })
  const removeRule = trpc.admin.expression.remove.useMutation({
    onSuccess: () => utils.admin.expression.listByLocus.invalidate({ locusId }),
  })
  const saveLocus = trpc.admin.locus.save.useMutation({
    onSuccess: () => utils.admin.locus.list.invalidate(),
  })

  const { data: conditionLinks } = trpc.admin.expression.listConditionLinksByLocus.useQuery({ locusId })
  const { data: allConditions } = trpc.admin.health.list.useQuery({ gameId })
  const addLinkByPhenotype = trpc.admin.expression.addConditionLinkByPhenotype.useMutation({
    onSuccess: () => utils.admin.expression.listConditionLinksByLocus.invalidate({ locusId }),
  })
  const removeLinkByPhenotype = trpc.admin.expression.removeConditionLinkByPhenotype.useMutation({
    onSuccess: () => utils.admin.expression.listConditionLinksByLocus.invalidate({ locusId }),
  })

  const [newSymbol, setNewSymbol] = useState("")
  const [editingAlleleId, setEditingAlleleId] = useState<string | null>(null)
  const [editSymbol, setEditSymbol] = useState("")
  const [editIsAvailable, setEditIsAvailable] = useState(false)
  const [editingRule, setEditingRule] = useState<RuleForm | null>(null)
  const [locusDesc, setLocusDesc] = useState<object | null>((locus.description as object | null) ?? null)
  const [isHidden, setIsHidden] = useState(locus.isHiddenModifier)
  const [inheritanceWeight, setInheritanceWeight] = useState(locus.inheritanceWeight.toString())
  const [newLink, setNewLink] = useState<PLinkForm>(emptyPLinkForm())

  const distinctPhenotypes = [...new Set(rules?.map(r => r.phenotype) ?? [])]
  const uniqueLinks = (() => {
    const seen = new Map<string, NonNullable<typeof conditionLinks>[0]>()
    for (const link of conditionLinks ?? []) {
      const key = `${link.expressionRule.phenotype}:${link.healthConditionDefId}`
      if (!seen.has(key)) seen.set(key, link)
    }
    return [...seen.values()]
  })()

  function addAllele() {
    if (!newSymbol.trim()) return
    saveAllele.mutate({ locusId, symbol: newSymbol.trim(), isAvailable: false })
  }

  function submitRule() {
    if (!editingRule) return
    saveRule.mutate({
      ...editingRule,
      locusId,
      numericModifier: editingRule.numericModifier !== "" ? parseFloat(editingRule.numericModifier) : undefined,
    })
  }

  return (
    <div className="border-t border-border">
      {/* Hidden / Inheritance settings */}
      <div className="border-b border-border px-4 py-2 flex items-center gap-6">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isHidden}
            onChange={e => {
              setIsHidden(e.target.checked)
              saveLocus.mutate({ id: locusId, gameId, name: locus.name, biasTarget: locus.biasTarget, minTestCycle: locus.minTestCycle ?? null, description: locusDesc, isHiddenModifier: e.target.checked, inheritanceWeight: parseFloat(inheritanceWeight) || 1 })
            }}
            className="accent-primary"
          />
          <span className="text-xs text-muted-foreground">Hidden modifier</span>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Inheritance weight</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={inheritanceWeight}
            onChange={e => setInheritanceWeight(e.target.value)}
            onBlur={() => saveLocus.mutate({ id: locusId, gameId, name: locus.name, biasTarget: locus.biasTarget, minTestCycle: locus.minTestCycle ?? null, description: locusDesc, isHiddenModifier: isHidden, inheritanceWeight: parseFloat(inheritanceWeight) || 1 })}
            className="h-7 w-20 rounded-md border border-input bg-background px-2 text-xs"
          />
        </label>
      </div>
      {/* Description */}
      <details className="border-b border-border group">
        <summary className="flex cursor-pointer items-center justify-between bg-muted/20 px-4 py-1.5 list-none">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</span>
          <span className="text-[10px] text-muted-foreground group-open:hidden">▶</span>
          <span className="text-[10px] text-muted-foreground hidden group-open:inline">▼</span>
        </summary>
        <div className="px-4 py-3 space-y-2">
          <RichTextEditor
            key={locusId}
            defaultContent={locusDesc}
            onChange={setLocusDesc}
            placeholder="Describe what this locus controls, how it affects phenotype, notes for players…"
            minHeight="5rem"
          />
          <div className="flex items-center justify-between">
            {saveLocus.error
              ? <p className="text-xs text-destructive">{saveLocus.error.message}</p>
              : <span />}
            <Button size="sm" className="h-6 px-2 text-xs" onClick={() => saveLocus.mutate({ id: locusId, gameId, name: locus.name, biasTarget: locus.biasTarget, minTestCycle: locus.minTestCycle ?? null, description: locusDesc, isHiddenModifier: isHidden, inheritanceWeight: parseFloat(inheritanceWeight) || 1 })}
              disabled={saveLocus.isPending}>
              {saveLocus.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </details>

      {/* Alleles */}
      <div className="border-b border-border">
        <div className="bg-muted/20 px-4 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Alleles</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symbol</th>
              <th className="px-4 py-1.5 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Available</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {alleles?.map((a) =>
              editingAlleleId === a.id ? (
                <tr key={a.id} className="border-b border-border">
                  <td className="px-4 py-1.5">
                    <Input value={editSymbol} onChange={e => setEditSymbol(e.target.value)}
                      className="h-6 text-xs font-mono w-28" autoFocus />
                  </td>
                  <td className="px-4 py-1.5 text-center">
                    <input type="checkbox" checked={editIsAvailable} onChange={e => setEditIsAvailable(e.target.checked)} />
                  </td>
                  <td className="px-4 py-1.5 text-right space-x-1">
                    <Button size="sm" className="h-6 px-2 text-xs"
                      onClick={() => saveAllele.mutate({ id: a.id, locusId, symbol: editSymbol, isAvailable: editIsAvailable })}
                      disabled={saveAllele.isPending}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingAlleleId(null)}>✕</Button>
                  </td>
                </tr>
              ) : (
                <tr key={a.id} className="border-b border-border last:border-0 group">
                  <td className="px-4 py-1.5 font-mono text-foreground">{a.symbol}</td>
                  <td className="px-4 py-1.5 text-center text-xs">
                    {a.availabilityState?.isAvailable
                      ? <span className="font-semibold text-primary">✓</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-1.5 text-right space-x-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => { setEditingAlleleId(a.id); setEditSymbol(a.symbol); setEditIsAvailable(a.availabilityState?.isAvailable ?? false) }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => { if (confirm(`Delete allele "${a.symbol}"?`)) removeAllele.mutate({ id: a.id }) }}>✕</Button>
                  </td>
                </tr>
              )
            )}
            <tr>
              <td className="px-4 py-1.5">
                <Input value={newSymbol} onChange={e => setNewSymbol(e.target.value)}
                  placeholder="Symbol (e.g. E, Ccr, n)" onKeyDown={e => e.key === "Enter" && addAllele()}
                  className="h-6 text-xs font-mono w-36" />
              </td>
              <td />
              <td className="px-4 py-1.5 text-right">
                <Button size="sm" className="h-6 px-2 text-xs" onClick={addAllele}
                  disabled={!newSymbol.trim() || saveAllele.isPending}>Add</Button>
              </td>
            </tr>
          </tbody>
        </table>
        {removeAllele.error && <p className="px-4 pb-2 text-xs text-destructive">{removeAllele.error.message}</p>}
      </div>

      {/* Expression Rules */}
      <div>
        <div className="flex items-center justify-between bg-muted/20 px-4 py-1.5 border-b border-border">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Expression Rules</span>
          {!editingRule && (alleles?.length ?? 0) >= 2 && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingRule(emptyRule())}>
              + Add Rule
            </Button>
          )}
        </div>

        {editingRule !== null && (
          <div className="border-b border-border bg-muted/10 px-4 py-3 space-y-2.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <FL>Allele 1</FL>
                <select value={editingRule.alleleOneId} onChange={e => setEditingRule({ ...editingRule, alleleOneId: e.target.value })}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs font-mono">
                  <option value="">Select…</option>
                  {alleles?.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <FL>Allele 2</FL>
                <select value={editingRule.alleleTwoId} onChange={e => setEditingRule({ ...editingRule, alleleTwoId: e.target.value })}
                  className="h-7 rounded-md border border-input bg-background px-2 text-xs font-mono">
                  <option value="">Select…</option>
                  {alleles?.map(a => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <FL>Phenotype</FL>
              <Input value={editingRule.phenotype} onChange={e => setEditingRule({ ...editingRule, phenotype: e.target.value })}
                placeholder="e.g. Bay, Black, Palomino" className="h-7 text-xs" />
            </div>
            <div className="flex flex-col gap-1">
              <FL>Numeric Modifier</FL>
              <Input type="number" step="0.01" value={editingRule.numericModifier}
                onChange={e => setEditingRule({ ...editingRule, numericModifier: e.target.value })}
                placeholder="optional" className="h-7 text-xs" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="h-7 px-3 text-xs" onClick={submitRule}
                disabled={saveRule.isPending || !editingRule.alleleOneId || !editingRule.alleleTwoId || !editingRule.phenotype.trim()}>
                {editingRule.id ? "Save Rule" : "Add Rule"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => setEditingRule(null)}>Cancel</Button>
            </div>
            {saveRule.error && <p className="text-xs text-destructive">{saveRule.error.message}</p>}
          </div>
        )}

        {(alleles?.length ?? 0) < 2 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground/60">Add at least 2 alleles to define expression rules.</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A1</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">A2</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phenotype</th>
                <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modifier</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules?.map(rule => (
                <tr key={rule.id} className="border-b border-border last:border-0 group">
                  <td className="px-4 py-1.5 font-mono">{rule.alleleOne.symbol}</td>
                  <td className="px-4 py-1.5 font-mono">{rule.alleleTwo.symbol}</td>
                  <td className="px-4 py-1.5 text-foreground">{rule.phenotype}</td>
                  <td className="px-4 py-1.5 text-muted-foreground">{rule.numericModifier ?? "—"}</td>
                  <td className="px-4 py-1.5 text-right space-x-1 opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap">
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                      onClick={() => setEditingRule({
                        id: rule.id, alleleOneId: rule.alleleOneId, alleleTwoId: rule.alleleTwoId,
                        phenotype: rule.phenotype, numericModifier: rule.numericModifier?.toString() ?? "",
                      })}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Delete this rule?")) removeRule.mutate({ id: rule.id }) }}>✕</Button>
                  </td>
                </tr>
              ))}
              {rules?.length === 0 && !editingRule && (
                <tr><td colSpan={5} className="px-4 py-4 text-center text-xs text-muted-foreground">No rules yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Phenotype Condition Links */}
      <div className="border-t border-border">
        <div className="bg-muted/20 px-4 py-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Phenotype Condition Links</span>
        </div>
        {distinctPhenotypes.length === 0 ? (
          <p className="px-4 py-3 text-xs text-muted-foreground/60">Define expression rules first.</p>
        ) : (
          <>
            {uniqueLinks.length > 0 && (
              <table className="w-full text-xs border-b border-border">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phenotype</th>
                    <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Condition</th>
                    <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Env Risk</th>
                    <th className="px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Penetrance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {uniqueLinks.map(link => (
                    <tr key={`${link.expressionRule.phenotype}:${link.healthConditionDefId}`} className="border-b border-border last:border-0 group">
                      <td className="px-4 py-1.5 text-foreground">{link.expressionRule.phenotype}</td>
                      <td className="px-4 py-1.5 text-foreground">{link.healthConditionDef.name}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{link.environmentalRiskModifier}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{link.penetrance ?? "—"}</td>
                      <td className="px-4 py-1.5 text-right opacity-0 transition-opacity group-hover:opacity-100">
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={removeLinkByPhenotype.isPending}
                          onClick={() => removeLinkByPhenotype.mutate({
                            locusId,
                            phenotype: link.expressionRule.phenotype,
                            healthConditionDefId: link.healthConditionDefId,
                          })}>✕</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="px-4 py-2.5 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <FL>Phenotype</FL>
                  <select value={newLink.phenotype} onChange={e => setNewLink(p => ({ ...p, phenotype: e.target.value }))}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="">Select…</option>
                    {distinctPhenotypes.map(ph => <option key={ph} value={ph}>{ph}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <FL>Condition</FL>
                  <select value={newLink.healthConditionDefId} onChange={e => setNewLink(p => ({ ...p, healthConditionDefId: e.target.value }))}
                    className="h-7 rounded-md border border-input bg-background px-2 text-xs">
                    <option value="">Select…</option>
                    {allConditions?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <FL>Env Risk</FL>
                  <Input type="number" step="0.1" min="0" value={newLink.environmentalRiskModifier}
                    onChange={e => setNewLink(p => ({ ...p, environmentalRiskModifier: e.target.value }))}
                    className="h-7 text-xs w-20" />
                </div>
                <div className="flex flex-col gap-1">
                  <FL>Penetrance <span className="font-normal normal-case">(opt)</span></FL>
                  <Input type="number" step="0.01" min="0" max="1" value={newLink.penetrance}
                    onChange={e => setNewLink(p => ({ ...p, penetrance: e.target.value }))}
                    placeholder="0–1" className="h-7 text-xs w-20" />
                </div>
                <Button size="sm" className="h-7 px-3 text-xs"
                  disabled={!newLink.phenotype || !newLink.healthConditionDefId || addLinkByPhenotype.isPending}
                  onClick={() => addLinkByPhenotype.mutate({
                    locusId,
                    phenotype: newLink.phenotype,
                    healthConditionDefId: newLink.healthConditionDefId,
                    environmentalRiskModifier: parseFloat(newLink.environmentalRiskModifier) || 0,
                    penetrance: newLink.penetrance !== "" ? parseFloat(newLink.penetrance) : null,
                  }, { onSuccess: () => setNewLink(emptyPLinkForm()) })}>
                  Apply to Phenotype
                </Button>
              </div>
              {addLinkByPhenotype.error && <p className="text-xs text-destructive">{addLinkByPhenotype.error.message}</p>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Genes Tab ─────────────────────────────────────────────────────────────────

function GenesTab({ panelId, gameId }: { panelId: string; gameId: string }) {
  const utils = trpc.useUtils()
  const { data: allLoci } = trpc.admin.locus.list.useQuery({ gameId })
  const { data: panelLoci } = trpc.admin.panel.listPanelLoci.useQuery({ panelDefId: panelId })

  const addPanelLocus = trpc.admin.panel.addPanelLocus.useMutation({
    onSuccess: () => {
      utils.admin.panel.listPanelLoci.invalidate({ panelDefId: panelId })
      utils.admin.panel.list.invalidate()
      setAddExistingId("")
    },
  })
  const removePanelLocus = trpc.admin.panel.removePanelLocus.useMutation({
    onSuccess: () => {
      utils.admin.panel.listPanelLoci.invalidate({ panelDefId: panelId })
      utils.admin.panel.list.invalidate()
    },
  })
  const saveLocus = trpc.admin.locus.save.useMutation({
    onSuccess: async (saved) => {
      await utils.admin.locus.list.invalidate()
      addPanelLocus.mutate({ panelDefId: panelId, locusId: saved.id })
      setExpandedLocusId(saved.id)
      setShowNewGene(false)
      setNewGene(emptyLocusCreate())
    },
  })

  const [expandedLocusId, setExpandedLocusId] = useState<string | null>(null)
  const [showNewGene, setShowNewGene] = useState(false)
  const [newGene, setNewGene] = useState<LocusCreateForm>(emptyLocusCreate())
  const [addExistingId, setAddExistingId] = useState("")

  const includedIds = new Set(panelLoci?.map(pl => pl.locusId) ?? [])
  const includedLoci = allLoci?.filter(l => includedIds.has(l.id)) ?? []
  const availableLoci = allLoci?.filter(l => !includedIds.has(l.id)) ?? []

  function submitNewGene() {
    if (!newGene.name.trim()) return
    saveLocus.mutate({
      gameId,
      name: newGene.name.trim(),
      biasTarget: newGene.biasTarget,
      minTestCycle: newGene.minTestCycle !== "" ? parseInt(newGene.minTestCycle) : null,
      description: newGene.description,
    })
  }

  return (
    <div>
      {/* Included loci */}
      {includedLoci.map(locus => {
        const record = panelLoci?.find(pl => pl.locusId === locus.id)
        const isExpanded = expandedLocusId === locus.id
        return (
          <div key={locus.id} className="border-b border-border last:border-0">
            <div
              className={cn(
                "flex cursor-pointer select-none items-center justify-between px-4 py-2.5 transition-colors hover:bg-muted/30",
                isExpanded && "bg-secondary/30",
              )}
              onClick={() => setExpandedLocusId(isExpanded ? null : locus.id)}
            >
              <div className="flex items-center gap-2.5">
                {isExpanded
                  ? <ChevronDown className="size-3.5 text-muted-foreground" />
                  : <ChevronRight className="size-3.5 text-muted-foreground" />}
                <span className="text-sm font-medium text-foreground">{locus.name}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {locus._count.alleles} allele{locus._count.alleles !== 1 ? "s" : ""}
                </span>
                {locus.isHiddenModifier && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">hidden</span>
                )}
                {locus.biasTarget !== "NONE" && (
                  <span className="text-[10px] text-muted-foreground/50">{locus.biasTarget}</span>
                )}
              </div>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
                onClick={e => { e.stopPropagation(); if (record) removePanelLocus.mutate({ id: record.id }) }}>
                Remove
              </Button>
            </div>
            {isExpanded && <LocusEditor locus={locus} gameId={gameId} />}
          </div>
        )
      })}

      {/* New gene inline form */}
      {showNewGene && (
        <div className="border-b border-border bg-muted/10 px-4 py-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New Gene</span>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
              onClick={() => { setShowNewGene(false); setNewGene(emptyLocusCreate()) }}>Cancel</Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <FL>Name</FL>
              <Input value={newGene.name} onChange={e => setNewGene(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Extension, Agouti" className="h-7 text-xs" autoFocus />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <FL>Bias Target</FL>
              <select value={newGene.biasTarget}
                onChange={e => setNewGene(p => ({ ...p, biasTarget: e.target.value as LocusCreateForm["biasTarget"] }))}
                className="h-7 rounded-md border border-input bg-background px-2 text-xs">
                <option value="NONE">None</option>
                <option value="FAVORABILITY">Favorability</option>
                <option value="RARITY">Rarity</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <FL>Min Test Cycle <span className="font-normal normal-case">(optional)</span></FL>
              <Input type="number" step="1" min="0" value={newGene.minTestCycle}
                onChange={e => setNewGene(p => ({ ...p, minTestCycle: e.target.value }))}
                placeholder="e.g. 6" className="h-7 text-xs" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FL>Description <span className="font-normal normal-case">(optional)</span></FL>
            <RichTextEditor
              defaultContent={newGene.description}
              onChange={(json) => setNewGene(p => ({ ...p, description: json }))}
              placeholder="Describe what this locus controls…"
              minHeight="5rem"
            />
          </div>
          <Button size="sm" className="h-7 px-3 text-xs" onClick={submitNewGene}
            disabled={!newGene.name.trim() || saveLocus.isPending}>
            {saveLocus.isPending ? "Creating…" : "Create Gene & Add to Panel"}
          </Button>
          {saveLocus.error && <p className="text-xs text-destructive">{saveLocus.error.message}</p>}
        </div>
      )}

      {/* Empty state */}
      {includedLoci.length === 0 && !showNewGene && (
        <div className="py-10 text-center">
          <p className="text-sm text-muted-foreground">No genes in this panel yet.</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 border-t border-border bg-card/50 px-4 py-2">
        {availableLoci.length > 0 && (
          <div className="flex items-center gap-2">
            <select value={addExistingId} onChange={e => setAddExistingId(e.target.value)}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs min-w-40">
              <option value="">Add existing gene…</option>
              {availableLoci.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <Button size="sm" className="h-7 px-2 text-xs"
              disabled={!addExistingId || addPanelLocus.isPending}
              onClick={() => { if (addExistingId) addPanelLocus.mutate({ panelDefId: panelId, locusId: addExistingId }) }}>
              Add
            </Button>
          </div>
        )}
        {!showNewGene && (
          <Button size="sm" variant="outline" className="ml-auto h-7 px-3 text-xs"
            onClick={() => setShowNewGene(true)}>
            + New Gene
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function GeneticPanelsPage() {
  const { gameId } = Route.useParams()
  const [editing, setEditing] = useState<PanelForm | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: panels } = trpc.admin.panel.list.useQuery({ gameId: gameId! })
  const utils = trpc.useUtils()

  const savePanel = trpc.admin.panel.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.panel.list.invalidate()
      setEditing(prev => prev ? { ...prev, id: saved.id } : null)
    },
  })
  const removePanel = trpc.admin.panel.remove.useMutation({
    onSuccess: () => {
      utils.admin.panel.list.invalidate()
      setEditing(null)
      setConfirmDelete(false)
    },
  })

  function handleSavePanel() {
    if (!editing || !gameId) return
    savePanel.mutate({ ...editing, gameId })
  }

  // ── List view ────────────────────────────────────────────────────────────────

  if (!editing) {
    return (
      <div className="p-4 max-w-5xl mx-auto space-y-4">
        <h1 className="font-serif text-xl font-semibold text-foreground px-1">Genetic Panels</h1>
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="grid grid-cols-[300px_1fr] divide-x divide-border">
            <div className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">All Panels</h2>
                <Button size="sm" variant="ghost" onClick={() => setEditing(emptyPanel())}>+ New</Button>
              </div>
              <div className="divide-y divide-border">
                {panels?.map(p => (
                  <button key={p.id} onClick={() => setEditing({ id: p.id, name: p.name, panelType: p.panelType, colorRole: (p as any).colorRole ?? null })}
                    className="w-full text-left px-3 py-2.5 transition-colors hover:bg-muted/40">
                    <div className="text-sm font-medium text-foreground">{p.name}</div>
                    <div className="text-xs capitalize text-muted-foreground">
                      {p.panelType.toLowerCase()} · {p._count.loci} gene{p._count.loci !== 1 ? "s" : ""}
                    </div>
                  </button>
                ))}
                {panels?.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">No panels yet.</p>
                )}
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-3 px-8 py-16 text-center">
              <p className="text-sm text-muted-foreground">Select a panel to manage its genes, alleles, and expression rules.</p>
              <Button size="sm" variant="outline" onClick={() => setEditing(emptyPanel())}>Add New Panel</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Edit view ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center gap-3 px-1">
        <button onClick={() => { setEditing(null); setConfirmDelete(false) }}
          className="text-sm text-muted-foreground hover:text-foreground">← Genetic Panels</button>
        <span className="text-muted-foreground">/</span>
        <h1 className="font-serif text-xl font-semibold text-foreground">{editing.id ? editing.name : "New Panel"}</h1>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="grid grid-cols-[300px_1fr] divide-x divide-border items-start">

          {/* Left: Panel Details */}
          <div>
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Panel Details</h2>
            </div>
            <div className="space-y-2.5 p-3">
              <div className="flex flex-col gap-1">
                <FL>Name</FL>
                <Input className="h-8 text-sm" value={editing.name}
                  onChange={e => setEditing(p => p ? { ...p, name: e.target.value } : p)} />
              </div>
              <div className="flex flex-col gap-1">
                <FL>Panel Type</FL>
                <select value={editing.panelType}
                  onChange={e => {
                    const panelType = e.target.value as PanelForm["panelType"]
                    const hasColorRole = panelType === "COLOR" || panelType === "VARIANCE"
                    setEditing(p => p ? { ...p, panelType, colorRole: hasColorRole ? p.colorRole : null } : p)
                  }}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="HEALTH">Health</option>
                  <option value="CONFORMATION">Conformation</option>
                  <option value="COLOR">Color</option>
                  <option value="VARIANCE">Variance</option>
                </select>
              </div>
              {(editing.panelType === "COLOR" || editing.panelType === "VARIANCE") && (
                <div className="flex flex-col gap-1">
                  <FL>Color Role</FL>
                  <select
                    value={editing.colorRole ?? ""}
                    onChange={e => setEditing(p => p ? { ...p, colorRole: e.target.value || null } : p)}
                    className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">None</option>
                    <option value="BASE">Base Color</option>
                    <option value="DILUTION">Dilution</option>
                    <option value="MODIFIER">Modifier</option>
                    <option value="WHITE_PATTERN">White Pattern</option>
                  </select>
                </div>
              )}
              {savePanel.error && <p className="text-sm text-destructive">{savePanel.error.message}</p>}
              <Button className="h-8 w-full text-sm" onClick={handleSavePanel}
                disabled={savePanel.isPending || !editing.name.trim()}>
                {savePanel.isPending ? "Saving…" : editing.id ? "Save Panel" : "Create Panel"}
              </Button>
              {editing.id && (
                <div className="border-t border-border pt-1">
                  {confirmDelete ? (
                    <div className="flex gap-2">
                      <Button variant="destructive" className="h-8 flex-1 text-sm" disabled={removePanel.isPending}
                        onClick={() => removePanel.mutate({ id: editing.id! })}>
                        {removePanel.isPending ? "Deleting…" : "Confirm Delete"}
                      </Button>
                      <Button variant="ghost" className="h-8 px-3 text-sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    </div>
                  ) : (
                    <Button variant="ghost" className="h-8 w-full text-sm text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setConfirmDelete(true)}>
                      Delete Panel
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Genes */}
          {editing.id ? (
            <div className="overflow-hidden">
              <div className="border-b border-border bg-secondary/40 px-4 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Genes</span>
              </div>
              <GenesTab panelId={editing.id} gameId={gameId!} />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <p className="text-sm text-muted-foreground">Save the panel first to add genes.</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
