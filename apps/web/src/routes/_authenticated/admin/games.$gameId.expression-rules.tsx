import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, Fragment } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type RuleForm = {
  id?: string
  alleleOneId: string
  alleleTwoId: string
  phenotype: string
  numericModifier: string
  penetrance: string
  healthConditionDefId: string
}
const emptyRule = (): RuleForm => ({ alleleOneId: "", alleleTwoId: "", phenotype: "", numericModifier: "", penetrance: "", healthConditionDefId: "" })

const CLIMATES = ["HOT", "WARM", "COLD", "TEMPERATE"] as const
const TERRAINS = ["FLAT", "COASTAL", "HILLY", "MOUNTAIN"] as const

function ExpressionRulesPage() {
  const { gameId } = Route.useParams()

  const { data: loci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    {}
  )
  const { data: healthConditions } = trpc.admin.health.list.useQuery(
    { gameId: gameId! },
    {}
  )

  const [selectedLocusId, setSelectedLocusId] = useState<string | null>(null)

  const { data: alleles } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: selectedLocusId! },
    { enabled: !!selectedLocusId }
  )
  const { data: rules } = trpc.admin.expression.listByLocus.useQuery(
    { locusId: selectedLocusId! },
    { enabled: !!selectedLocusId }
  )

  const utils = trpc.useUtils()
  const invalidateRules = () =>
    utils.admin.expression.listByLocus.invalidate({ locusId: selectedLocusId! })

  const saveRule = trpc.admin.expression.save.useMutation({
    onSuccess: () => {
      invalidateRules()
      setEditingRule(null)
    },
  })
  const removeRule = trpc.admin.expression.remove.useMutation({
    onSuccess: invalidateRules,
  })
  const saveClimate = trpc.admin.expression.saveClimateModifier.useMutation({
    onSuccess: () => {
      invalidateRules()
      setNewClimate({ climate: "", modifier: "" })
    },
  })
  const removeClimate = trpc.admin.expression.removeClimateModifier.useMutation({
    onSuccess: invalidateRules,
  })
  const saveTerrain = trpc.admin.expression.saveTerrainModifier.useMutation({
    onSuccess: () => {
      invalidateRules()
      setNewTerrain({ terrain: "", modifier: "" })
    },
  })
  const removeTerrain = trpc.admin.expression.removeTerrainModifier.useMutation({
    onSuccess: invalidateRules,
  })

  const [editingRule, setEditingRule] = useState<RuleForm | null>(null)
  const [expandedRuleId, setExpandedRuleId] = useState<string | null>(null)
  const [newClimate, setNewClimate] = useState({ climate: "", modifier: "" })
  const [newTerrain, setNewTerrain] = useState({ terrain: "", modifier: "" })

  function handleLocusChange(locusId: string) {
    setSelectedLocusId(locusId || null)
    setEditingRule(null)
    setExpandedRuleId(null)
    setNewClimate({ climate: "", modifier: "" })
    setNewTerrain({ terrain: "", modifier: "" })
  }

  function toggleExpand(ruleId: string) {
    setExpandedRuleId(expandedRuleId === ruleId ? null : ruleId)
    setNewClimate({ climate: "", modifier: "" })
    setNewTerrain({ terrain: "", modifier: "" })
  }

  function submitRule() {
    if (!editingRule || !selectedLocusId) return
    saveRule.mutate({
      ...editingRule,
      locusId: selectedLocusId,
      numericModifier: editingRule.numericModifier !== "" ? parseFloat(editingRule.numericModifier) : undefined,
      penetrance: editingRule.penetrance !== "" ? parseFloat(editingRule.penetrance) : undefined,
      healthConditionDefId: editingRule.healthConditionDefId || undefined,
    })
  }

  function submitNewClimate(ruleId: string) {
    if (!newClimate.climate || !newClimate.modifier) return
    saveClimate.mutate({
      expressionRuleId: ruleId,
      climate: newClimate.climate as (typeof CLIMATES)[number],
      modifier: parseFloat(newClimate.modifier),
    })
  }

  function submitNewTerrain(ruleId: string) {
    if (!newTerrain.terrain || !newTerrain.modifier) return
    saveTerrain.mutate({
      expressionRuleId: ruleId,
      terrain: newTerrain.terrain as (typeof TERRAINS)[number],
      modifier: parseFloat(newTerrain.modifier),
    })
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Expression Rules</h1>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Locus</label>
        <select
          value={selectedLocusId ?? ""}
          onChange={(e) => handleLocusChange(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-3 text-sm w-full max-w-xs"
        >
          <option value="">— Select a locus —</option>
          {loci?.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {selectedLocusId && alleles?.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            No alleles on this locus yet. Add alleles in Loci &amp; Alleles first.
          </p>
        )}
      </div>

      {selectedLocusId && alleles && alleles.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-md p-2 space-y-2">
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Rules</h2>
              <Button size="sm" onClick={() => setEditingRule(emptyRule())}>
                + Add Rule
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 1</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Allele 2</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phenotype</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modifier</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Health Condition</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Penetrance</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules?.map((rule) => (
                  <Fragment key={rule.id}>
                    <tr className="border-b border-border">
                      <td className="px-3 py-2 font-mono text-foreground">{rule.alleleOne.symbol}</td>
                      <td className="px-3 py-2 font-mono text-foreground">{rule.alleleTwo.symbol}</td>
                      <td className="px-3 py-2 text-foreground">{rule.phenotype}</td>
                      <td className="px-3 py-2 text-muted-foreground">{rule.numericModifier ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{rule.healthConditionDef?.name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {rule.penetrance != null ? `${(rule.penetrance * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right space-x-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toggleExpand(rule.id)}
                          className="text-xs"
                        >
                          {expandedRuleId === rule.id ? "▲" : "▼"} Region
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setEditingRule({
                              id: rule.id,
                              alleleOneId: rule.alleleOneId,
                              alleleTwoId: rule.alleleTwoId,
                              phenotype: rule.phenotype,
                              numericModifier: rule.numericModifier?.toString() ?? "",
                              penetrance: rule.penetrance?.toString() ?? "",
                              healthConditionDefId: rule.healthConditionDefId ?? "",
                            })
                          }
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (!confirm("Delete this expression rule?")) return
                            removeRule.mutate({ id: rule.id })
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                    {expandedRuleId === rule.id && (
                      <tr className="border-b border-border bg-muted/30">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Climate Modifiers
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Climate</th>
                                    <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modifier</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {rule.climateModifiers.map((cm) => (
                                    <tr key={cm.id}>
                                      <td className="py-0.5 pr-2">{cm.climate}</td>
                                      <td className="py-0.5 pr-2">{cm.modifier}</td>
                                      <td>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1 text-xs text-destructive hover:text-destructive"
                                          onClick={() => removeClimate.mutate({ id: cm.id })}
                                        >
                                          ✕
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td className="py-1 pr-2">
                                      <select
                                        value={newClimate.climate}
                                        onChange={(e) => setNewClimate({ ...newClimate, climate: e.target.value })}
                                        className="h-7 rounded-md border border-input bg-background px-2 text-xs w-full"
                                      >
                                        <option value="">Climate</option>
                                        {CLIMATES.filter(
                                          (c) => !rule.climateModifiers.some((m) => m.climate === c)
                                        ).map((c) => (
                                          <option key={c} value={c}>{c}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-1 pr-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={newClimate.modifier}
                                        onChange={(e) => setNewClimate({ ...newClimate, modifier: e.target.value })}
                                        placeholder="0.0"
                                        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                                      />
                                    </td>
                                    <td>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-xs"
                                        onClick={() => submitNewClimate(rule.id)}
                                        disabled={saveClimate.isPending || !newClimate.climate || !newClimate.modifier}
                                      >
                                        Add
                                      </Button>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                Terrain Modifiers
                              </p>
                              <table className="w-full text-xs">
                                <thead>
                                  <tr>
                                    <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Terrain</th>
                                    <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Modifier</th>
                                    <th />
                                  </tr>
                                </thead>
                                <tbody>
                                  {rule.terrainModifiers.map((tm) => (
                                    <tr key={tm.id}>
                                      <td className="py-0.5 pr-2">{tm.terrain}</td>
                                      <td className="py-0.5 pr-2">{tm.modifier}</td>
                                      <td>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-5 px-1 text-xs text-destructive hover:text-destructive"
                                          onClick={() => removeTerrain.mutate({ id: tm.id })}
                                        >
                                          ✕
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                  <tr>
                                    <td className="py-1 pr-2">
                                      <select
                                        value={newTerrain.terrain}
                                        onChange={(e) => setNewTerrain({ ...newTerrain, terrain: e.target.value })}
                                        className="h-7 rounded-md border border-input bg-background px-2 text-xs w-full"
                                      >
                                        <option value="">Terrain</option>
                                        {TERRAINS.filter(
                                          (t) => !rule.terrainModifiers.some((m) => m.terrain === t)
                                        ).map((t) => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="py-1 pr-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={newTerrain.modifier}
                                        onChange={(e) => setNewTerrain({ ...newTerrain, modifier: e.target.value })}
                                        placeholder="0.0"
                                        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                                      />
                                    </td>
                                    <td>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 px-2 text-xs"
                                        onClick={() => submitNewTerrain(rule.id)}
                                        disabled={saveTerrain.isPending || !newTerrain.terrain || !newTerrain.modifier}
                                      >
                                        Add
                                      </Button>
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {rules?.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No rules yet. Add a rule to define how allele combinations express.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {removeRule.error && (
              <p className="px-3 pb-3 text-sm text-destructive">{removeRule.error.message}</p>
            )}
          </section>

          {editingRule !== null && (
            <section className="rounded-lg border border-border bg-card shadow-sm">
              <div className="border-b border-border bg-secondary/40 px-3 py-2">
                <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {editingRule.id ? "Edit Rule" : "Add Rule"}
                </h2>
              </div>
              <div className="p-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 1</label>
                    <select
                      value={editingRule.alleleOneId}
                      onChange={(e) => setEditingRule({ ...editingRule, alleleOneId: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono"
                    >
                      <option value="">Select allele</option>
                      {alleles?.map((a) => (
                        <option key={a.id} value={a.id}>{a.symbol}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 2</label>
                    <select
                      value={editingRule.alleleTwoId}
                      onChange={(e) => setEditingRule({ ...editingRule, alleleTwoId: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono"
                    >
                      <option value="">Select allele</option>
                      {alleles?.map((a) => (
                        <option key={a.id} value={a.id}>{a.symbol}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phenotype</label>
                  <Input
                    value={editingRule.phenotype}
                    onChange={(e) => setEditingRule({ ...editingRule, phenotype: e.target.value })}
                    placeholder="e.g. Bay, Black, Palomino"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Numeric Modifier <span className="font-normal">(optional — e.g. life expectancy multiplier)</span>
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editingRule.numericModifier}
                    onChange={(e) => setEditingRule({ ...editingRule, numericModifier: e.target.value })}
                    placeholder="1.0"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Health Condition <span className="font-normal">(optional)</span>
                    </label>
                    <select
                      value={editingRule.healthConditionDefId}
                      onChange={(e) => setEditingRule({ ...editingRule, healthConditionDefId: e.target.value })}
                      className="h-8 rounded-md border border-input bg-background px-3 text-sm"
                    >
                      <option value="">— None —</option>
                      {healthConditions?.filter((c) => c.isGenetic).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                      Penetrance <span className="font-normal">(0–1, optional)</span>
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={editingRule.penetrance}
                      onChange={(e) => setEditingRule({ ...editingRule, penetrance: e.target.value })}
                      placeholder="e.g. 0.85"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    onClick={submitRule}
                    disabled={
                      saveRule.isPending ||
                      !editingRule.alleleOneId ||
                      !editingRule.alleleTwoId ||
                      !editingRule.phenotype.trim()
                    }
                  >
                    {editingRule.id ? "Save" : "Add Rule"}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditingRule(null)}>
                    Cancel
                  </Button>
                </div>
                {saveRule.error && (
                  <p className="text-sm text-destructive">{saveRule.error.message}</p>
                )}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/expression-rules")({
  component: ExpressionRulesPage,
})
