import { createFileRoute } from "@tanstack/react-router"
import { trpc } from "@/lib/trpc"
import { useState, Fragment } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { RichTextEditor } from "@/components/game/editor/RichTextEditor"

const TREATMENT_TYPES = ["OTC", "PRESCRIPTION", "VET_PROCEDURE", "ACTIVITY_RESTRICTION", "PLAYER_ACTION"] as const
type TreatmentType = typeof TREATMENT_TYPES[number]
const TREATMENT_LABELS: Record<TreatmentType, string> = {
  OTC: "OTC", PRESCRIPTION: "Prescription", VET_PROCEDURE: "Vet Procedure",
  ACTIVITY_RESTRICTION: "Activity Restriction", PLAYER_ACTION: "Player Action",
}

const ITEM_TYPES = ["OTC_MEDICATION", "CARE_CONSUMABLE", "EQUIPMENT", "DIRECT_EFFECT", "PERMANENT_APPLIED", "ANIMAL_SLOT_EXPAND", "SUBCONTAINER_EXPAND", "AGING_BASE", "AGING_PREMIUM"] as const
type ItemType = typeof ITEM_TYPES[number]
const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  OTC_MEDICATION: "OTC Medication", CARE_CONSUMABLE: "Care Consumable", EQUIPMENT: "Equipment",
  DIRECT_EFFECT: "Direct Effect", PERMANENT_APPLIED: "Permanent Applied", ANIMAL_SLOT_EXPAND: "Slot Expand",
  SUBCONTAINER_EXPAND: "Sub Expand", AGING_BASE: "Aging Base", AGING_PREMIUM: "Aging Premium",
}
const ITEM_CATEGORIES = ["AGING", "CARE", "HEALTH", "EQUIPMENT", "BREEDING", "STORAGE", "MISC"] as const
type ItemCategory = typeof ITEM_CATEGORIES[number]

const RESTRICTION_TYPES = ["TRAINING", "COMPETITION", "BREEDING", "CARE_ACTION", "ALL"] as const
type RestrictionType = typeof RESTRICTION_TYPES[number]
const RESTRICTION_LABELS: Record<RestrictionType, string> = {
  TRAINING: "Training", COMPETITION: "Competition", BREEDING: "Breeding",
  CARE_ACTION: "Care Actions", ALL: "All Activities",
}

type ConditionForm = {
  id?: string
  name: string
  conditionType: "ILLNESS" | "INJURY"
  isGenetic: boolean
  isEpisodic: boolean
  isFatal: boolean
  moodEffect: string
  energyEffect: string
  onsetMinCycle: string
  fatalityChance: string
  fatalMaxCycle: string
  flareupCooldownCycles: string
  procedureFatalityRisk: string
  suppressionItemDefId: string
  baseWeight: string
  description: object | null
}

const emptyCondition = (): ConditionForm => ({
  name: "", conditionType: "ILLNESS", isGenetic: false, isEpisodic: false, isFatal: false,
  moodEffect: "", energyEffect: "", onsetMinCycle: "", fatalityChance: "", fatalMaxCycle: "",
  flareupCooldownCycles: "", procedureFatalityRisk: "", suppressionItemDefId: "", baseWeight: "1", description: null,
})

type TriggerForm = { triggerType: "VET_PROCEDURE" | "TRAINING_TIER"; minTierIndex: string; triggerChance: string }
const emptyTrigger = (): TriggerForm => ({ triggerType: "VET_PROCEDURE", minTierIndex: "", triggerChance: "1" })

type BehaviorRow = { symptomText: string; careActionDefId: string }
const emptyBehavior = (): BehaviorRow => ({ symptomText: "", careActionDefId: "" })

type TreatmentForm = { name: string; treatmentType: TreatmentType; durationCycles: string; isLifelong: boolean; cost: string; currencyDefId: string }
const emptyTreatment = (): TreatmentForm => ({ name: "", treatmentType: "OTC", durationCycles: "", isLifelong: false, cost: "", currencyDefId: "" })

type ItemRow = { itemDefId: string; quantity: string; requiresEquipped: boolean }
const emptyItem = (): ItemRow => ({ itemDefId: "", quantity: "1", requiresEquipped: false })

type RestrictionRow = { restrictionType: RestrictionType; maxIntensityTier: string; durationCycles: string; isLifelong: boolean }
const emptyRestriction = (): RestrictionRow => ({ restrictionType: "TRAINING", maxIntensityTier: "", durationCycles: "", isLifelong: false })

type EditRuleForm = { alleleOneId: string; alleleTwoId: string; phenotype: string; penetrance: string; environmentalRiskModifier: string }

type CreateRuleForm = { locusId: string; alleleOneId: string; alleleTwoId: string; phenotype: string; penetrance: string; environmentalRiskModifier: string }
const emptyCreateRule = (): CreateRuleForm => ({ locusId: "", alleleOneId: "", alleleTwoId: "", phenotype: "", penetrance: "", environmentalRiskModifier: "0" })

type CreateItemForm = { name: string; itemType: ItemType; category: ItemCategory }
const emptyCreateItem = (): CreateItemForm => ({ name: "", itemType: "OTC_MEDICATION", category: "HEALTH" })

function HealthConditionsPage() {
  const { gameId } = Route.useParams()

  const { data: conditions } = trpc.admin.health.list.useQuery({ gameId: gameId! }, {})
  const { data: careActions } = trpc.admin.care.list.useQuery({ gameId: gameId! }, {})
  const { data: itemDefs } = trpc.admin.item.list.useQuery({ gameId: gameId! }, {})
  const { data: loci } = trpc.admin.locus.list.useQuery({ gameId: gameId! })
  const { data: currencies } = trpc.admin.currency.list.useQuery({ gameId: gameId! })

  const utils = trpc.useUtils()

  const saveCondition = trpc.admin.health.save.useMutation({
    onSuccess: () => utils.admin.health.list.invalidate(),
  })
  const removeCondition = trpc.admin.health.remove.useMutation({
    onSuccess: () => {
      utils.admin.health.list.invalidate()
      setEditing(null)
    },
  })

  const [editing, setEditing] = useState<ConditionForm | null>(null)
  const [rightTab, setRightTab] = useState<"behaviors" | "treatments" | "genetics" | "triggers">("behaviors")

  // Behavior state
  const { data: behaviors } = trpc.admin.health.listBehaviors.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id }
  )
  const saveBehavior = trpc.admin.health.saveBehavior.useMutation({
    onSuccess: () => {
      utils.admin.health.listBehaviors.invalidate({ conditionDefId: editing?.id })
      utils.admin.health.list.invalidate()
      setEditingBehaviorId(null)
      setEditingBehavior(null)
      setNewBehavior(emptyBehavior())
    },
  })
  const removeBehavior = trpc.admin.health.removeBehavior.useMutation({
    onSuccess: () => {
      utils.admin.health.listBehaviors.invalidate({ conditionDefId: editing?.id })
      utils.admin.health.list.invalidate()
    },
  })
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editingBehavior, setEditingBehavior] = useState<BehaviorRow | null>(null)
  const [newBehavior, setNewBehavior] = useState<BehaviorRow>(emptyBehavior())
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)
  const [editingTrigger, setEditingTrigger] = useState<TriggerForm | null>(null)
  const [newTrigger, setNewTrigger] = useState<TriggerForm>(emptyTrigger())

  // Treatment state
  const [expandedTreatmentId, setExpandedTreatmentId] = useState<string | null>(null)
  const [expandedView, setExpandedView] = useState<"items" | "restrictions" | null>(null)
  const [editingTreatmentId, setEditingTreatmentId] = useState<string | null>(null)
  const [editingTreatment, setEditingTreatment] = useState<TreatmentForm | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null)
  const [newItem, setNewItem] = useState<ItemRow>(emptyItem())
  const [editingRestrictionId, setEditingRestrictionId] = useState<string | null>(null)
  const [editingRestriction, setEditingRestriction] = useState<RestrictionRow | null>(null)
  const [newRestriction, setNewRestriction] = useState<RestrictionRow>(emptyRestriction())

  const { data: treatments } = trpc.admin.treatment.listByCondition.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id && rightTab === "treatments" }
  )
  const { data: treatmentItems } = trpc.admin.treatment.listItems.useQuery(
    { treatmentDefId: expandedTreatmentId! },
    { enabled: !!expandedTreatmentId }
  )
  const { data: treatmentRestrictions } = trpc.admin.treatment.listRestrictions.useQuery(
    { treatmentDefId: expandedTreatmentId! },
    { enabled: !!expandedTreatmentId }
  )
  const saveRestriction = trpc.admin.treatment.saveRestriction.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listRestrictions.invalidate({ treatmentDefId: expandedTreatmentId! })
      setEditingRestrictionId(null)
      setEditingRestriction(null)
      setNewRestriction(emptyRestriction())
    },
  })
  const removeRestriction = trpc.admin.treatment.removeRestriction.useMutation({
    onSuccess: () => utils.admin.treatment.listRestrictions.invalidate({ treatmentDefId: expandedTreatmentId! }),
  })

  // Genetics state
  const [linkRuleId, setLinkRuleId] = useState("")
  const [linkLocusId, setLinkLocusId] = useState("")
  const [linkPhenotype, setLinkPhenotype] = useState("")
  const [linkEnvRisk, setLinkEnvRisk] = useState("0")
  const [linkPenetrance, setLinkPenetrance] = useState("")
  const [creatingRule, setCreatingRule] = useState(false)
  const [createRuleForm, setCreateRuleForm] = useState<CreateRuleForm>(emptyCreateRule())
  const { data: createRuleAlleles } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: createRuleForm.locusId },
    { enabled: !!createRuleForm.locusId }
  )
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null)
  const [editingRuleForm, setEditingRuleForm] = useState<EditRuleForm | null>(null)
  const [editingRuleLocusId, setEditingRuleLocusId] = useState("")
  const { data: editRuleAlleles } = trpc.admin.locus.listAlleles.useQuery(
    { locusId: editingRuleLocusId },
    { enabled: !!editingRuleLocusId }
  )
  const [creatingItem, setCreatingItem] = useState(false)
  const [createItemForm, setCreateItemForm] = useState<CreateItemForm>(emptyCreateItem())

  const { data: triggers } = trpc.admin.health.listTriggers.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id && rightTab === "triggers" }
  )
  const saveTrigger = trpc.admin.health.saveTrigger.useMutation({
    onSuccess: () => {
      utils.admin.health.listTriggers.invalidate({ conditionDefId: editing?.id })
      setEditingTriggerId(null)
      setEditingTrigger(null)
      setNewTrigger(emptyTrigger())
    },
  })
  const removeTrigger = trpc.admin.health.removeTrigger.useMutation({
    onSuccess: () => utils.admin.health.listTriggers.invalidate({ conditionDefId: editing?.id }),
  })

  const { data: linkedRules } = trpc.admin.expression.listByCondition.useQuery(
    { conditionDefId: editing?.id! },
    { enabled: !!editing?.id && rightTab === "genetics" }
  )
  const { data: availableRules } = trpc.admin.expression.listAvailableForCondition.useQuery(
    { gameId: gameId!, conditionDefId: editing?.id! },
    { enabled: !!editing?.id && rightTab === "genetics" }
  )
  const { data: allLoci } = trpc.admin.locus.list.useQuery(
    { gameId: gameId! },
    { enabled: !!editing?.id && rightTab === "genetics" }
  )
  const { data: linkLocusRules } = trpc.admin.expression.listByLocus.useQuery(
    { locusId: linkLocusId },
    { enabled: !!linkLocusId }
  )
  const addConditionLink = trpc.admin.expression.addConditionLink.useMutation({
    onSuccess: () => {
      utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id })
      utils.admin.expression.listAvailableForCondition.invalidate({ gameId: gameId!, conditionDefId: editing?.id! })
      setLinkRuleId("")
    },
  })
  const addLinkByPhenotype = trpc.admin.expression.addConditionLinkByPhenotype.useMutation({
    onSuccess: () => {
      utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id })
      utils.admin.expression.listAvailableForCondition.invalidate({ gameId: gameId!, conditionDefId: editing?.id! })
      setLinkLocusId("")
      setLinkPhenotype("")
      setLinkEnvRisk("0")
      setLinkPenetrance("")
    },
  })
  const removeConditionLink = trpc.admin.expression.removeConditionLink.useMutation({
    onSuccess: () => {
      utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id })
      utils.admin.expression.listAvailableForCondition.invalidate({ gameId: gameId!, conditionDefId: editing?.id! })
    },
  })
  const updateConditionLink = trpc.admin.expression.updateConditionLink.useMutation({
    onSuccess: () => utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id }),
  })
  const saveExpression = trpc.admin.expression.save.useMutation({
    onSuccess: (saved) => {
      if (editing?.id) {
        addConditionLink.mutate({
          expressionRuleId: saved.id,
          healthConditionDefId: editing.id,
          penetrance: (editing.isGenetic || editing.conditionType === "ILLNESS") && createRuleForm.penetrance ? parseFloat(createRuleForm.penetrance) : null,
          environmentalRiskModifier: !editing.isGenetic && editing.conditionType === "INJURY" && createRuleForm.environmentalRiskModifier ? parseFloat(createRuleForm.environmentalRiskModifier) : 0,
        })
      }
      utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id })
      utils.admin.expression.listAvailableForCondition.invalidate({ gameId: gameId!, conditionDefId: editing?.id! })
      setCreatingRule(false)
      setCreateRuleForm(emptyCreateRule())
    },
  })
  const updateExpression = trpc.admin.expression.save.useMutation({
    onSuccess: () => {
      utils.admin.expression.listByCondition.invalidate({ conditionDefId: editing?.id })
      setEditingRuleId(null)
      setEditingLinkId(null)
      setEditingRuleForm(null)
      setEditingRuleLocusId("")
    },
  })
  const saveItemInline = trpc.admin.item.save.useMutation({
    onSuccess: (saved) => {
      utils.admin.item.list.invalidate({ gameId: gameId! })
      setCreatingItem(false)
      setCreateItemForm(emptyCreateItem())
      setNewItem({ itemDefId: saved.id, quantity: "1" })
    },
  })

  const saveTreatment = trpc.admin.treatment.save.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const removeTreatment = trpc.admin.treatment.remove.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setExpandedTreatmentId(null)
      setEditingTreatmentId(null)
      setEditingTreatment(null)
    },
  })
  const saveItem = trpc.admin.treatment.saveItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
      setEditingItemId(null)
      setEditingItem(null)
      setNewItem(emptyItem())
    },
  })
  const removeItem = trpc.admin.treatment.removeItem.useMutation({
    onSuccess: () => {
      utils.admin.treatment.listItems.invalidate({ treatmentDefId: expandedTreatmentId! })
      utils.admin.treatment.listByCondition.invalidate({ conditionDefId: editing?.id })
    },
  })

  function openEdit(condition: NonNullable<typeof conditions>[number]) {
    setEditing({
      id: condition.id, name: condition.name, conditionType: condition.conditionType,
      isGenetic: condition.isGenetic, isEpisodic: condition.isEpisodic, isFatal: condition.isFatal,
      moodEffect: condition.moodEffect?.toString() ?? "",
      energyEffect: condition.energyEffect?.toString() ?? "",
      onsetMinCycle: condition.onsetMinCycle?.toString() ?? "",
      fatalityChance: condition.fatalityChance?.toString() ?? "",
      fatalMaxCycle: condition.fatalMaxCycle?.toString() ?? "",
      flareupCooldownCycles: condition.flareupCooldownCycles?.toString() ?? "",
      procedureFatalityRisk: condition.procedureFatalityRisk?.toString() ?? "",
      suppressionItemDefId: condition.suppressionItemDefId ?? "",
      baseWeight: condition.baseWeight?.toString() ?? "1",
      description: (condition.description as object | null) ?? null,
    })
    setRightTab("behaviors")
    setEditingBehaviorId(null); setEditingBehavior(null); setNewBehavior(emptyBehavior())
    setExpandedTreatmentId(null); setExpandedView(null); setEditingTreatmentId(null); setEditingTreatment(null)
    setEditingItemId(null); setEditingItem(null); setNewItem(emptyItem())
    setEditingRestrictionId(null); setEditingRestriction(null); setNewRestriction(emptyRestriction())
    setLinkRuleId("")
    setLinkLocusId(""); setLinkPhenotype(""); setLinkEnvRisk("0"); setLinkPenetrance("")
    setCreatingRule(false); setCreateRuleForm(emptyCreateRule())
    setCreatingItem(false); setCreateItemForm(emptyCreateItem())
    setEditingTriggerId(null); setEditingTrigger(null); setNewTrigger(emptyTrigger())
  }

  function submitCondition() {
    if (!editing || !gameId) return
    saveCondition.mutate(
      {
        id: editing.id, gameId, name: editing.name, conditionType: editing.conditionType,
        isGenetic: editing.isGenetic, isEpisodic: editing.isEpisodic, isFatal: editing.isFatal,
        moodEffect: editing.moodEffect !== "" ? parseFloat(editing.moodEffect) : null,
        energyEffect: editing.energyEffect !== "" ? parseFloat(editing.energyEffect) : null,
        onsetMinCycle: editing.onsetMinCycle !== "" ? parseInt(editing.onsetMinCycle) : null,
        fatalityChance: editing.fatalityChance !== "" ? parseFloat(editing.fatalityChance) : null,
        fatalMaxCycle: editing.fatalMaxCycle !== "" ? parseInt(editing.fatalMaxCycle) : null,
        flareupCooldownCycles: editing.flareupCooldownCycles !== "" ? parseInt(editing.flareupCooldownCycles) : null,
        procedureFatalityRisk: editing.procedureFatalityRisk !== "" ? parseFloat(editing.procedureFatalityRisk) : null,
        suppressionItemDefId: editing.suppressionItemDefId || null,
        baseWeight: editing.baseWeight !== "" ? parseFloat(editing.baseWeight) : 1,
        description: editing.description,
      },
      { onSuccess: (saved) => setEditing((prev) => (prev ? { ...prev, id: saved.id } : null)) }
    )
  }

  function submitBehavior(id?: string) {
    const form = id ? editingBehavior : newBehavior
    if (!form || !editing?.id || !form.symptomText.trim()) return
    saveBehavior.mutate({ id, conditionDefId: editing.id, symptomText: form.symptomText.trim(), careActionDefId: form.careActionDefId || null })
  }

  const PAID_TYPES: TreatmentType[] = ["PRESCRIPTION", "VET_PROCEDURE"]

  function submitTreatment() {
    if (!editingTreatment || !editing?.id || !editingTreatment.name.trim()) return
    const hasCost = PAID_TYPES.includes(editingTreatment.treatmentType)
    saveTreatment.mutate({
      id: editingTreatmentId ?? undefined,
      conditionDefId: editing.id,
      name: editingTreatment.name.trim(),
      treatmentType: editingTreatment.treatmentType,
      durationCycles: editingTreatment.isLifelong ? null : (editingTreatment.durationCycles ? parseInt(editingTreatment.durationCycles) : null),
      cost: hasCost && editingTreatment.cost !== "" ? parseInt(editingTreatment.cost) : null,
      currencyDefId: hasCost && editingTreatment.currencyDefId ? editingTreatment.currencyDefId : null,
    })
  }

  function submitItem(id?: string) {
    const form = id ? editingItem : newItem
    if (!form || !expandedTreatmentId || !form.itemDefId) return
    saveItem.mutate({ id, treatmentDefId: expandedTreatmentId, itemDefId: form.itemDefId, quantity: form.requiresEquipped ? 1 : parseInt(form.quantity) || 1, requiresEquipped: form.requiresEquipped })
  }

  function toggleExpand(treatmentId: string, view: "items" | "restrictions") {
    if (expandedTreatmentId === treatmentId && expandedView === view) {
      setExpandedTreatmentId(null); setExpandedView(null)
    } else {
      setExpandedTreatmentId(treatmentId); setExpandedView(view)
    }
    setEditingItemId(null); setEditingItem(null); setNewItem(emptyItem())
    setCreatingItem(false); setCreateItemForm(emptyCreateItem())
    setEditingRestrictionId(null); setEditingRestriction(null); setNewRestriction(emptyRestriction())
  }

  function submitRestriction(id?: string) {
    const form = id ? editingRestriction : newRestriction
    if (!form || !expandedTreatmentId) return
    saveRestriction.mutate({
      id,
      treatmentDefId: expandedTreatmentId,
      restrictionType: form.restrictionType,
      maxIntensityTier: form.maxIntensityTier !== "" ? parseInt(form.maxIntensityTier) : null,
      durationCycles: form.isLifelong ? null : (form.durationCycles !== "" ? parseInt(form.durationCycles) : null),
    })
  }

  function submitCreateRule() {
    if (!createRuleForm.locusId || !createRuleForm.alleleOneId || !createRuleForm.alleleTwoId || !createRuleForm.phenotype.trim() || !editing?.id) return
    saveExpression.mutate({
      locusId: createRuleForm.locusId,
      alleleOneId: createRuleForm.alleleOneId,
      alleleTwoId: createRuleForm.alleleTwoId,
      phenotype: createRuleForm.phenotype.trim(),
    })
  }

  function submitEditRule() {
    if (!editingRuleId || !editingRuleForm || !editingRuleLocusId || !editingRuleForm.alleleOneId || !editingRuleForm.alleleTwoId || !editingRuleForm.phenotype.trim()) return
    updateExpression.mutate({
      id: editingRuleId,
      locusId: editingRuleLocusId,
      alleleOneId: editingRuleForm.alleleOneId,
      alleleTwoId: editingRuleForm.alleleTwoId,
      phenotype: editingRuleForm.phenotype.trim(),
    })
    if (editingLinkId) {
      updateConditionLink.mutate({
        id: editingLinkId,
        penetrance: editingRuleForm.penetrance ? parseFloat(editingRuleForm.penetrance) : null,
        environmentalRiskModifier: editingRuleForm.environmentalRiskModifier ? parseFloat(editingRuleForm.environmentalRiskModifier) : 0,
      })
    }
  }

  function submitCreateItem() {
    if (!gameId || !createItemForm.name.trim()) return
    saveItemInline.mutate({
      gameId,
      name: createItemForm.name.trim(),
      itemType: createItemForm.itemType,
      category: createItemForm.category,
      prizeEligible: true,
      isSellable: true,
    })
  }

  function submitTrigger(id?: string) {
    const form = id ? editingTrigger : newTrigger
    if (!form || !editing?.id) return
    saveTrigger.mutate({
      id,
      conditionDefId: editing.id,
      triggerType: form.triggerType,
      minTierIndex: form.minTierIndex !== "" ? parseInt(form.minTierIndex) : null,
      triggerChance: parseFloat(form.triggerChance) || 1.0,
    })
  }

  if (editing !== null) {
    return (
      <div className="p-4 space-y-3 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <button onClick={() => setEditing(null)} className="text-sm text-muted-foreground hover:text-foreground">← Back to list</button>
          <h1 className="font-serif text-xl font-semibold text-foreground">
            {editing.id ? editing.name : "New Health Condition"}
          </h1>
        </div>

        <div className="rounded-xl border border-border bg-card shadow-md p-2 space-y-2">
        <div className="grid grid-cols-[300px_1fr] gap-2 items-start">
          {/* Left: condition details */}
          <section className="rounded-lg border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-secondary/40 px-3 py-2">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Condition Details</h2>
            </div>
            <div className="p-3 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                <Input className="h-8 text-sm" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                <select value={editing.conditionType} onChange={(e) => setEditing({ ...editing, conditionType: e.target.value as "ILLNESS" | "INJURY" })}
                  className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="ILLNESS">Illness</option>
                  <option value="INJURY">Injury</option>
                </select>
              </div>
              <div className="flex gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={editing.isGenetic} onChange={(e) => setEditing({ ...editing, isGenetic: e.target.checked, isEpisodic: e.target.checked ? editing.isEpisodic : false })} />
                  Genetic
                </label>
                {editing.isGenetic && (
                  <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                    <input type="checkbox" checked={editing.isEpisodic} onChange={(e) => setEditing({ ...editing, isEpisodic: e.target.checked })} />
                    Episodic
                  </label>
                )}
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={editing.isFatal} onChange={(e) => setEditing({ ...editing, isFatal: e.target.checked })} />
                  Fatal
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Flareup Cooldown (cycles)</label>
                <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.flareupCooldownCycles}
                  onChange={(e) => setEditing({ ...editing, flareupCooldownCycles: e.target.value })} placeholder="e.g. 12" />
              </div>
              {editing.isGenetic && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Procedure Fatality Risk</label>
                    <Input className="h-8 text-sm" type="number" step="0.01" min="0" max="1" value={editing.procedureFatalityRisk}
                      onChange={(e) => setEditing({ ...editing, procedureFatalityRisk: e.target.value })} placeholder="0–1" />
                  </div>
                  {editing.procedureFatalityRisk !== "" && parseFloat(editing.procedureFatalityRisk) > 0 && (
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Suppression Item</label>
                      <select value={editing.suppressionItemDefId} onChange={(e) => setEditing({ ...editing, suppressionItemDefId: e.target.value })}
                        className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                        <option value="">None</option>
                        {itemDefs?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Mood Effect</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" value={editing.moodEffect}
                    onChange={(e) => setEditing({ ...editing, moodEffect: e.target.value })} placeholder="e.g. -0.2" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Energy Effect</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" value={editing.energyEffect}
                    onChange={(e) => setEditing({ ...editing, energyEffect: e.target.value })} placeholder="e.g. -0.1" />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Onset Min Cycle</label>
                <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.onsetMinCycle}
                  onChange={(e) => setEditing({ ...editing, onsetMinCycle: e.target.value })} placeholder="e.g. 24" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Base Weight <span className="font-normal normal-case">(illness selection)</span></label>
                <Input className="h-8 text-sm" type="number" step="0.1" min="0" value={editing.baseWeight}
                  onChange={(e) => setEditing({ ...editing, baseWeight: e.target.value })} placeholder="1" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fatality Chance</label>
                  <Input className="h-8 text-sm" type="number" step="0.01" min="0" max="1" value={editing.fatalityChance}
                    onChange={(e) => setEditing({ ...editing, fatalityChance: e.target.value })} placeholder="0–1" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Fatal Max Cycle</label>
                  <Input className="h-8 text-sm" type="number" step="1" min="0" value={editing.fatalMaxCycle}
                    onChange={(e) => setEditing({ ...editing, fatalMaxCycle: e.target.value })} placeholder="e.g. 48" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button onClick={submitCondition} disabled={saveCondition.isPending || !editing.name.trim()}>Save</Button>
              </div>
              {saveCondition.error && <p className="text-sm text-destructive">{saveCondition.error.message}</p>}
              {editing.id && (
                <div className="border-t border-border pt-3">
                  {removeCondition.error && <p className="text-sm text-destructive">{removeCondition.error.message}</p>}
                  <Button variant="ghost" className="text-destructive hover:text-destructive w-full"
                    onClick={() => {
                      if (!confirm("Delete this health condition? This will also remove all its behaviors and treatments.")) return
                      removeCondition.mutate({ id: editing.id! })
                    }}
                    disabled={removeCondition.isPending}>
                    Delete Condition
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* Right: tabbed panel */}
          {editing.id && (
            <section className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              {/* Tab bar */}
              <div className="flex items-center gap-4 border-b border-border bg-secondary/40 px-3 py-2">
                {(["behaviors", "treatments", "genetics", "triggers"] as const).map(tab => (
                  <button key={tab} onClick={() => setRightTab(tab)}
                    className={`text-[10px] font-bold uppercase tracking-wider pb-0.5 border-b-2 transition-colors ${
                      rightTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}>
                    {tab === "behaviors" ? "Behaviors & Symptoms" : tab === "treatments" ? "Treatments" : tab === "genetics" ? "Linked Genes" : "Triggers"}
                  </button>
                ))}
              </div>

              {/* Behaviors tab */}
              {rightTab === "behaviors" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Symptom Text</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Linked Care Action</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {behaviors?.map((b: NonNullable<typeof behaviors>[number]) =>
                      editingBehaviorId === b.id ? (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <Input value={editingBehavior?.symptomText ?? ""} onChange={(e) => setEditingBehavior((p) => p ? { ...p, symptomText: e.target.value } : null)} className="h-7 text-sm" />
                          </td>
                          <td className="px-3 py-2">
                            <select value={editingBehavior?.careActionDefId ?? ""} onChange={(e) => setEditingBehavior((p) => p ? { ...p, careActionDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                              <option value="">None</option>
                              {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" onClick={() => submitBehavior(b.id)} disabled={saveBehavior.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingBehaviorId(null); setEditingBehavior(null) }}>Cancel</Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={b.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">{b.symptomText}</td>
                          <td className="px-3 py-2 text-muted-foreground">{b.careActionDef?.name ?? "—"}</td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingBehaviorId(b.id); setEditingBehavior({ symptomText: b.symptomText, careActionDefId: b.careActionDefId ?? "" }) }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeBehavior.mutate({ id: b.id })}>Delete</Button>
                          </td>
                        </tr>
                      )
                    )}
                    <tr>
                      <td className="px-3 py-3">
                        <Input value={newBehavior.symptomText} onChange={(e) => setNewBehavior({ ...newBehavior, symptomText: e.target.value })} placeholder="e.g. Animal appears lethargic" onKeyDown={(e) => e.key === "Enter" && submitBehavior()} className="h-7 text-sm" />
                      </td>
                      <td className="px-3 py-3">
                        <select value={newBehavior.careActionDefId} onChange={(e) => setNewBehavior({ ...newBehavior, careActionDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                          <option value="">None</option>
                          {careActions?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" onClick={() => submitBehavior()} disabled={!newBehavior.symptomText.trim() || saveBehavior.isPending}>Add</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* Treatments tab */}
              {rightTab === "treatments" && (
                <div className={editingTreatment !== null ? "grid grid-cols-[280px_1fr] divide-x divide-border" : ""}>
                  {editingTreatment !== null && (
                    <div className="p-3 space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {editingTreatmentId ? "Edit Treatment" : "Add Treatment"}
                      </p>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                        <Input className="h-8 text-sm" value={editingTreatment.name} onChange={(e) => setEditingTreatment({ ...editingTreatment, name: e.target.value })} placeholder="e.g. Rest & Recovery" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                        <select value={editingTreatment.treatmentType} onChange={(e) => setEditingTreatment({ ...editingTreatment, treatmentType: e.target.value as TreatmentType })} className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                          {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{TREATMENT_LABELS[t]}</option>)}
                        </select>
                      </div>
                      {editingTreatment.treatmentType !== "VET_PROCEDURE" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Duration (cycles)</label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={editingTreatment.isLifelong}
                              onChange={(e) => setEditingTreatment({ ...editingTreatment, isLifelong: e.target.checked, durationCycles: e.target.checked ? "" : "1" })}
                            />
                            Lifelong (no expiry)
                          </label>
                          {!editingTreatment.isLifelong && (
                            <Input className="h-8 text-sm" type="number" min="1" value={editingTreatment.durationCycles} onChange={(e) => setEditingTreatment({ ...editingTreatment, durationCycles: e.target.value })} placeholder="Number of cycles" />
                          )}
                        </div>
                      )}
                      {PAID_TYPES.includes(editingTreatment.treatmentType) && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Cost</label>
                            <Input className="h-8 text-sm" type="number" min="0" step="1" value={editingTreatment.cost} onChange={(e) => setEditingTreatment({ ...editingTreatment, cost: e.target.value })} placeholder="e.g. 50" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Currency</label>
                            <select value={editingTreatment.currencyDefId} onChange={(e) => setEditingTreatment({ ...editingTreatment, currencyDefId: e.target.value })} className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                              <option value="">None (free)</option>
                              {currencies?.map((c) => <option key={c.id} value={c.id}>{c.name}{c.symbol ? ` (${c.symbol})` : ""}</option>)}
                            </select>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitTreatment} disabled={saveTreatment.isPending || !editingTreatment.name.trim()}>
                          {editingTreatmentId ? "Save" : "Add Treatment"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingTreatmentId(null); setEditingTreatment(null) }}>Cancel</Button>
                      </div>
                      {saveTreatment.error && <p className="text-sm text-destructive">{saveTreatment.error.message}</p>}
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between border-b border-border bg-muted/20 px-3 py-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Treatments</span>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setEditingTreatment(emptyTreatment()); setEditingTreatmentId(null) }}>+ Add</Button>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</th>
                          <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cost</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Items</th>
                          <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Restrictions</th>
                          <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {treatments?.map((t: NonNullable<typeof treatments>[number]) => (
                          <Fragment key={t.id}>
                            <tr className={`border-b border-border ${expandedTreatmentId === t.id ? "bg-muted/30" : ""}`}>
                              <td className="px-3 py-2 font-medium text-foreground">{t.name}</td>
                              <td className="px-3 py-2 text-muted-foreground">{TREATMENT_LABELS[t.treatmentType as TreatmentType]}</td>
                              <td className="px-3 py-2 text-muted-foreground">{t.durationCycles != null ? `${t.durationCycles} cycles` : <span className="italic">Lifelong</span>}</td>
                              <td className="px-3 py-2 text-muted-foreground">{t.cost ? `${t.currencyDef?.symbol ?? ""}${t.cost}` : <span className="italic text-muted-foreground/50">—</span>}</td>
                              <td className="px-3 py-2 text-center text-muted-foreground">{t._count.items}</td>
                              <td className="px-3 py-2 text-center text-muted-foreground">{t._count.restrictionDefs}</td>
                              <td className="px-3 py-2 text-right space-x-1">
                                <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => toggleExpand(t.id, "items")}>
                                  {expandedTreatmentId === t.id && expandedView === "items" ? "▲" : "▼"} Items
                                </Button>
                                <Button size="sm" variant="ghost" className="text-xs h-6 px-2" onClick={() => toggleExpand(t.id, "restrictions")}>
                                  {expandedTreatmentId === t.id && expandedView === "restrictions" ? "▲" : "▼"} Restrictions
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => {
                                  setEditingTreatmentId(t.id)
                                  setEditingTreatment({ name: t.name, treatmentType: t.treatmentType as TreatmentType, durationCycles: t.durationCycles?.toString() ?? "", isLifelong: t.durationCycles == null, cost: t.cost?.toString() ?? "", currencyDefId: t.currencyDef?.id ?? "" })
                                }}>Edit</Button>
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                                  onClick={() => { if (!confirm("Delete this treatment?")) return; removeTreatment.mutate({ id: t.id }) }}>
                                  Delete
                                </Button>
                              </td>
                            </tr>
                            {expandedTreatmentId === t.id && expandedView === "items" && (
                              <tr className="border-b border-border bg-muted/10">
                                <td colSpan={7} className="px-6 py-3">
                                  {creatingItem && (
                                    <div className="mb-3 p-3 rounded-lg border border-border bg-card space-y-2">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">New Item</p>
                                      <div className="grid grid-cols-3 gap-2">
                                        <div className="flex flex-col gap-1 col-span-3">
                                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Name</label>
                                          <Input className="h-8 text-sm" value={createItemForm.name} onChange={(e) => setCreateItemForm({ ...createItemForm, name: e.target.value })} placeholder="e.g. Antibiotic" />
                                        </div>
                                        <div className="flex flex-col gap-1 col-span-2">
                                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Type</label>
                                          <select value={createItemForm.itemType} onChange={(e) => setCreateItemForm({ ...createItemForm, itemType: e.target.value as ItemType })} className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                                            {ITEM_TYPES.map((it) => <option key={it} value={it}>{ITEM_TYPE_LABELS[it]}</option>)}
                                          </select>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Category</label>
                                          <select value={createItemForm.category} onChange={(e) => setCreateItemForm({ ...createItemForm, category: e.target.value as ItemCategory })} className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                                            {ITEM_CATEGORIES.map((c) => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
                                          </select>
                                        </div>
                                      </div>
                                      <div className="flex gap-2">
                                        <Button size="sm" onClick={submitCreateItem} disabled={!createItemForm.name.trim() || saveItemInline.isPending}>Create Item</Button>
                                        <Button size="sm" variant="ghost" onClick={() => { setCreatingItem(false); setCreateItemForm(emptyCreateItem()) }}>Cancel</Button>
                                      </div>
                                      {saveItemInline.error && <p className="text-sm text-destructive">{saveItemInline.error.message}</p>}
                                    </div>
                                  )}
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity</th>
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Equipped</th>
                                        <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {treatmentItems?.map((item: NonNullable<typeof treatmentItems>[number]) =>
                                        editingItemId === item.id ? (
                                          <tr key={item.id} className="border-b border-border last:border-0">
                                            <td className="py-1.5 pr-4">
                                              <select value={editingItem?.itemDefId ?? ""} onChange={(e) => setEditingItem(p => p ? { ...p, itemDefId: e.target.value } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                                {itemDefs?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                              </select>
                                            </td>
                                            <td className="py-1.5 pr-4">
                                              <Input type="number" min="1" value={editingItem?.quantity ?? "1"} onChange={(e) => setEditingItem(p => p ? { ...p, quantity: e.target.value } : null)} className="h-7 text-sm w-20" disabled={editingItem?.requiresEquipped} />
                                            </td>
                                            <td className="py-1.5 pr-4">
                                              <input type="checkbox" checked={editingItem?.requiresEquipped ?? false} onChange={(e) => setEditingItem(p => p ? { ...p, requiresEquipped: e.target.checked } : null)} />
                                            </td>
                                            <td className="py-1.5 text-right space-x-2">
                                              <Button size="sm" onClick={() => submitItem(item.id)} disabled={saveItem.isPending}>Save</Button>
                                              <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(null); setEditingItem(null) }}>Cancel</Button>
                                            </td>
                                          </tr>
                                        ) : (
                                          <tr key={item.id} className="border-b border-border last:border-0">
                                            <td className="py-1.5 pr-4 font-medium text-foreground">{item.itemDef.name}</td>
                                            <td className="py-1.5 pr-4 text-muted-foreground">{item.requiresEquipped ? <span className="italic">—</span> : item.quantity}</td>
                                            <td className="py-1.5 pr-4 text-muted-foreground">{item.requiresEquipped ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                                            <td className="py-1.5 text-right space-x-2">
                                              <Button size="sm" variant="ghost" onClick={() => { setEditingItemId(item.id); setEditingItem({ itemDefId: item.itemDefId, quantity: item.quantity.toString(), requiresEquipped: item.requiresEquipped }) }}>Edit</Button>
                                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeItem.mutate({ id: item.id })}>Delete</Button>
                                            </td>
                                          </tr>
                                        )
                                      )}
                                      <tr>
                                        <td className="py-1.5 pr-4">
                                          <div className="flex items-center gap-2">
                                            <select value={newItem.itemDefId} onChange={(e) => setNewItem({ ...newItem, itemDefId: e.target.value })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                              <option value="">{itemDefs?.length ? "Select item…" : "No items yet"}</option>
                                              {itemDefs?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </select>
                                            {!creatingItem && (
                                              <button className="text-xs text-muted-foreground hover:text-foreground whitespace-nowrap" onClick={() => setCreatingItem(true)}>+ New</button>
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          <Input type="number" min="1" value={newItem.quantity} onChange={(e) => setNewItem({ ...newItem, quantity: e.target.value })} className="h-7 text-sm w-20" disabled={newItem.requiresEquipped} />
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          <input type="checkbox" checked={newItem.requiresEquipped} onChange={(e) => setNewItem({ ...newItem, requiresEquipped: e.target.checked })} />
                                        </td>
                                        <td className="py-1.5 text-right">
                                          <Button size="sm" onClick={() => submitItem()} disabled={!newItem.itemDefId || saveItem.isPending}>Add</Button>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                            {expandedTreatmentId === t.id && expandedView === "restrictions" && (
                              <tr className="border-b border-border bg-muted/10">
                                <td colSpan={7} className="px-6 py-3">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b border-border">
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Restriction Type</th>
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Intensity Tier</th>
                                        <th className="pb-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration (cycles)</th>
                                        <th className="pb-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {treatmentRestrictions?.map((r: NonNullable<typeof treatmentRestrictions>[number]) =>
                                        editingRestrictionId === r.id ? (
                                          <tr key={r.id} className="border-b border-border last:border-0">
                                            <td className="py-1.5 pr-4">
                                              <select value={editingRestriction?.restrictionType ?? "TRAINING"} onChange={(e) => setEditingRestriction(p => p ? { ...p, restrictionType: e.target.value as RestrictionType } : null)} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                                {RESTRICTION_TYPES.map((rt) => <option key={rt} value={rt}>{RESTRICTION_LABELS[rt]}</option>)}
                                              </select>
                                            </td>
                                            <td className="py-1.5 pr-4">
                                              {(editingRestriction?.restrictionType === "TRAINING" || editingRestriction?.restrictionType === "ALL") && (
                                                <Input type="number" min="0" value={editingRestriction?.maxIntensityTier ?? ""} onChange={(e) => setEditingRestriction(p => p ? { ...p, maxIntensityTier: e.target.value } : null)} className="h-7 text-sm w-20" placeholder="None" />
                                              )}
                                            </td>
                                            <td className="py-1.5 pr-4">
                                              <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none shrink-0">
                                                  <input type="checkbox" checked={editingRestriction?.isLifelong ?? false} onChange={(e) => setEditingRestriction(p => p ? { ...p, isLifelong: e.target.checked, durationCycles: "" } : null)} />
                                                  Lifelong
                                                </label>
                                                {!editingRestriction?.isLifelong && (
                                                  <Input type="number" min="1" value={editingRestriction?.durationCycles ?? ""} onChange={(e) => setEditingRestriction(p => p ? { ...p, durationCycles: e.target.value } : null)} className="h-7 text-sm w-20" />
                                                )}
                                              </div>
                                            </td>
                                            <td className="py-1.5 text-right space-x-2">
                                              <Button size="sm" onClick={() => submitRestriction(r.id)} disabled={saveRestriction.isPending}>Save</Button>
                                              <Button size="sm" variant="ghost" onClick={() => { setEditingRestrictionId(null); setEditingRestriction(null) }}>Cancel</Button>
                                            </td>
                                          </tr>
                                        ) : (
                                          <tr key={r.id} className="border-b border-border last:border-0">
                                            <td className="py-1.5 pr-4 font-medium text-foreground">{RESTRICTION_LABELS[r.restrictionType as RestrictionType]}</td>
                                            <td className="py-1.5 pr-4 text-muted-foreground">{(r.restrictionType === "TRAINING" || r.restrictionType === "ALL") ? (r.maxIntensityTier ?? <span className="italic">None</span>) : <span className="italic text-muted-foreground/50">—</span>}</td>
                                            <td className="py-1.5 pr-4 text-muted-foreground">{r.durationCycles != null ? `${r.durationCycles} cycles` : <span className="italic">Lifelong</span>}</td>
                                            <td className="py-1.5 text-right space-x-2">
                                              <Button size="sm" variant="ghost" onClick={() => { setEditingRestrictionId(r.id); setEditingRestriction({ restrictionType: r.restrictionType as RestrictionType, maxIntensityTier: r.maxIntensityTier?.toString() ?? "", durationCycles: r.durationCycles?.toString() ?? "", isLifelong: r.durationCycles == null }) }}>Edit</Button>
                                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeRestriction.mutate({ id: r.id })}>Delete</Button>
                                            </td>
                                          </tr>
                                        )
                                      )}
                                      <tr>
                                        <td className="py-1.5 pr-4">
                                          <select value={newRestriction.restrictionType} onChange={(e) => setNewRestriction({ ...newRestriction, restrictionType: e.target.value as RestrictionType })} className="h-7 rounded border border-input bg-background px-2 text-xs">
                                            {RESTRICTION_TYPES.map((rt) => <option key={rt} value={rt}>{RESTRICTION_LABELS[rt]}</option>)}
                                          </select>
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          {(newRestriction.restrictionType === "TRAINING" || newRestriction.restrictionType === "ALL") && (
                                            <Input type="number" min="0" value={newRestriction.maxIntensityTier} onChange={(e) => setNewRestriction({ ...newRestriction, maxIntensityTier: e.target.value })} className="h-7 text-sm w-20" placeholder="None" />
                                          )}
                                        </td>
                                        <td className="py-1.5 pr-4">
                                          <div className="flex items-center gap-2">
                                            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none shrink-0">
                                              <input type="checkbox" checked={newRestriction.isLifelong} onChange={(e) => setNewRestriction({ ...newRestriction, isLifelong: e.target.checked, durationCycles: "" })} />
                                              Lifelong
                                            </label>
                                            {!newRestriction.isLifelong && (
                                              <Input type="number" min="1" value={newRestriction.durationCycles} onChange={(e) => setNewRestriction({ ...newRestriction, durationCycles: e.target.value })} className="h-7 text-sm w-20" />
                                            )}
                                          </div>
                                        </td>
                                        <td className="py-1.5 text-right">
                                          <Button size="sm" onClick={() => submitRestriction()} disabled={saveRestriction.isPending}>Add</Button>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                        {treatments?.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted-foreground">No treatments yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Genetics tab */}
              {rightTab === "genetics" && (
                <div>
                  {editingRuleId && editingRuleForm ? (
                    <div className="p-3 border-b border-border space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Edit Rule</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1 col-span-2">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Locus</label>
                          <p className="text-sm text-muted-foreground px-1">{linkedRules?.find(rc => rc.expressionRule.id === editingRuleId)?.expressionRule.locus.name}</p>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 1</label>
                          <select value={editingRuleForm.alleleOneId} onChange={(e) => setEditingRuleForm({ ...editingRuleForm, alleleOneId: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono">
                            <option value="">Select…</option>
                            {editRuleAlleles?.map((a) => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 2</label>
                          <select value={editingRuleForm.alleleTwoId} onChange={(e) => setEditingRuleForm({ ...editingRuleForm, alleleTwoId: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono">
                            <option value="">Select…</option>
                            {editRuleAlleles?.map((a) => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phenotype</label>
                          <Input className="h-8 text-sm" value={editingRuleForm.phenotype} onChange={(e) => setEditingRuleForm({ ...editingRuleForm, phenotype: e.target.value })} />
                        </div>
                        {editing.isGenetic || editing.conditionType === "ILLNESS" ? (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Penetrance {!editing.isGenetic && <span className="font-normal normal-case">(selection weight bonus)</span>}</label>
                            <Input className="h-8 text-sm" type="number" min="0" step="0.01" value={editingRuleForm.penetrance} onChange={(e) => setEditingRuleForm({ ...editingRuleForm, penetrance: e.target.value })} />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Env Risk Modifier <span className="font-normal normal-case">(0.5 = 1.5× risk)</span></label>
                            <Input className="h-8 text-sm" type="number" min="0" step="0.1" value={editingRuleForm.environmentalRiskModifier} onChange={(e) => setEditingRuleForm({ ...editingRuleForm, environmentalRiskModifier: e.target.value })} placeholder="0" />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitEditRule}
                          disabled={!editingRuleForm.alleleOneId || !editingRuleForm.alleleTwoId || !editingRuleForm.phenotype.trim() || updateExpression.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setEditingRuleId(null); setEditingRuleForm(null); setEditingRuleLocusId("") }}>Cancel</Button>
                      </div>
                      {updateExpression.error && <p className="text-sm text-destructive">{updateExpression.error.message}</p>}
                    </div>
                  ) : creatingRule ? (
                    <div className="p-3 border-b border-border space-y-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Create & Link Rule</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1 col-span-2">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Locus</label>
                          <select value={createRuleForm.locusId} onChange={(e) => setCreateRuleForm({ ...createRuleForm, locusId: e.target.value, alleleOneId: "", alleleTwoId: "" })}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Select locus…</option>
                            {loci?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 1</label>
                          <select value={createRuleForm.alleleOneId} onChange={(e) => setCreateRuleForm({ ...createRuleForm, alleleOneId: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono" disabled={!createRuleForm.locusId}>
                            <option value="">Select…</option>
                            {createRuleAlleles?.map((a) => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Allele 2</label>
                          <select value={createRuleForm.alleleTwoId} onChange={(e) => setCreateRuleForm({ ...createRuleForm, alleleTwoId: e.target.value })}
                            className="h-8 rounded-md border border-input bg-background px-3 text-sm font-mono" disabled={!createRuleForm.locusId}>
                            <option value="">Select…</option>
                            {createRuleAlleles?.map((a) => <option key={a.id} value={a.id}>{a.symbol}</option>)}
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Phenotype</label>
                          <Input className="h-8 text-sm" value={createRuleForm.phenotype} onChange={(e) => setCreateRuleForm({ ...createRuleForm, phenotype: e.target.value })} placeholder="e.g. dominant_white_lethal" />
                        </div>
                        {editing.isGenetic || editing.conditionType === "ILLNESS" ? (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Penetrance {!editing.isGenetic && <span className="font-normal normal-case">(selection weight bonus)</span>}</label>
                            <Input className="h-8 text-sm" type="number" min="0" step="0.01" value={createRuleForm.penetrance} onChange={(e) => setCreateRuleForm({ ...createRuleForm, penetrance: e.target.value })} placeholder="e.g. 1.5" />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Env Risk Modifier <span className="font-normal normal-case">(0.5 = 1.5× risk)</span></label>
                            <Input className="h-8 text-sm" type="number" min="0" step="0.1" value={createRuleForm.environmentalRiskModifier} onChange={(e) => setCreateRuleForm({ ...createRuleForm, environmentalRiskModifier: e.target.value })} placeholder="0" />
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={submitCreateRule}
                          disabled={!createRuleForm.locusId || !createRuleForm.alleleOneId || !createRuleForm.alleleTwoId || !createRuleForm.phenotype.trim() || saveExpression.isPending}>
                          Create & Link
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setCreatingRule(false); setCreateRuleForm(emptyCreateRule()) }}>Cancel</Button>
                      </div>
                      {saveExpression.error && <p className="text-sm text-destructive">{saveExpression.error.message}</p>}
                    </div>
                  ) : (
                    <div className="flex justify-end px-3 py-2 border-b border-border">
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setCreatingRule(true)}>+ Create Rule</Button>
                    </div>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Locus</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Genotype</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Phenotype</th>
                        <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{!editing.isGenetic && editing.conditionType === "INJURY" ? "Env Risk Mod" : "Penetrance"}</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedRules?.map((rc) => (
                        <tr key={rc.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-muted-foreground">{rc.expressionRule.locus.name}</td>
                          <td className="px-3 py-2 font-mono font-medium text-foreground">{rc.expressionRule.alleleOne.symbol}/{rc.expressionRule.alleleTwo.symbol}</td>
                          <td className="px-3 py-2 text-muted-foreground">{rc.expressionRule.phenotype}</td>
                          <td className="px-3 py-2 text-muted-foreground">{!editing.isGenetic && editing.conditionType === "INJURY" ? rc.environmentalRiskModifier : (rc.penetrance ?? "—")}</td>
                          <td className="px-3 py-2 text-right space-x-1">
                            <Button size="sm" variant="ghost"
                              onClick={() => {
                                setEditingRuleId(rc.expressionRule.id)
                                setEditingLinkId(rc.id)
                                setEditingRuleLocusId(rc.expressionRule.locus.id)
                                setEditingRuleForm({ alleleOneId: rc.expressionRule.alleleOne.id, alleleTwoId: rc.expressionRule.alleleTwo.id, phenotype: rc.expressionRule.phenotype, penetrance: rc.penetrance?.toString() ?? "1", environmentalRiskModifier: rc.environmentalRiskModifier?.toString() ?? "0" })
                                setCreatingRule(false)
                              }}
                              disabled={!!editingRuleId}>
                              Edit
                            </Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                              onClick={() => removeConditionLink.mutate({ id: rc.id })}
                              disabled={removeConditionLink.isPending || !!editingRuleId}>
                              Unlink
                            </Button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2} className="px-3 py-2">
                          <select value={linkLocusId} onChange={(e) => { setLinkLocusId(e.target.value); setLinkPhenotype("") }}
                            className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm">
                            <option value="">Select locus…</option>
                            {allLoci?.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                        <td colSpan={3} className="px-3 py-2">
                          <select value={linkPhenotype} onChange={(e) => setLinkPhenotype(e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-3 text-sm"
                            disabled={!linkLocusId}>
                            <option value="">Select phenotype…</option>
                            {[...new Set(linkLocusRules?.map(r => r.phenotype) ?? [])].map(ph => (
                              <option key={ph} value={ph}>{ph}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="px-3 py-2">
                          <div className="flex gap-2">
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] text-muted-foreground">Env Risk</label>
                              <Input type="number" step="0.1" min="0" value={linkEnvRisk}
                                onChange={e => setLinkEnvRisk(e.target.value)} className="h-7 text-sm w-20" />
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <label className="text-[10px] text-muted-foreground">Penetrance (opt)</label>
                              <Input type="number" step="0.01" min="0" max="1" value={linkPenetrance}
                                onChange={e => setLinkPenetrance(e.target.value)} placeholder="0–1" className="h-7 text-sm w-20" />
                            </div>
                          </div>
                        </td>
                        <td colSpan={3} className="px-3 py-2 text-right">
                          <Button size="sm"
                            disabled={!linkLocusId || !linkPhenotype || addLinkByPhenotype.isPending}
                            onClick={() => addLinkByPhenotype.mutate({
                              locusId: linkLocusId,
                              phenotype: linkPhenotype,
                              healthConditionDefId: editing!.id!,
                              environmentalRiskModifier: parseFloat(linkEnvRisk) || 0,
                              penetrance: linkPenetrance !== "" ? parseFloat(linkPenetrance) : null,
                            })}>
                            Apply to Phenotype
                          </Button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {/* Triggers tab */}
              {rightTab === "triggers" && (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min Tier</th>
                      <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Chance</th>
                      <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triggers?.map((t) =>
                      editingTriggerId === t.id ? (
                        <tr key={t.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2">
                            <select value={editingTrigger?.triggerType ?? "VET_PROCEDURE"} onChange={(e) => setEditingTrigger(p => p ? { ...p, triggerType: e.target.value as "VET_PROCEDURE" | "TRAINING_TIER" } : null)}
                              className="h-7 rounded border border-input bg-background px-2 text-xs">
                              <option value="VET_PROCEDURE">Vet Procedure</option>
                              <option value="TRAINING_TIER">Training Tier</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {editingTrigger?.triggerType === "TRAINING_TIER" && (
                              <Input type="number" min="0" value={editingTrigger.minTierIndex} onChange={(e) => setEditingTrigger(p => p ? { ...p, minTierIndex: e.target.value } : null)} className="h-7 text-sm w-16" placeholder="≥" />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" max="1" step="0.01" value={editingTrigger?.triggerChance ?? "1"} onChange={(e) => setEditingTrigger(p => p ? { ...p, triggerChance: e.target.value } : null)} className="h-7 text-sm w-16" />
                          </td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" onClick={() => submitTrigger(t.id)} disabled={saveTrigger.isPending}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setEditingTriggerId(null); setEditingTrigger(null) }}>Cancel</Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={t.id} className="border-b border-border last:border-0">
                          <td className="px-3 py-2 text-foreground">{t.triggerType === "VET_PROCEDURE" ? "Vet Procedure" : "Training Tier"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.minTierIndex != null ? `≥ ${t.minTierIndex}` : "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{t.triggerChance}</td>
                          <td className="px-3 py-2 text-right space-x-2">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingTriggerId(t.id); setEditingTrigger({ triggerType: t.triggerType, minTierIndex: t.minTierIndex?.toString() ?? "", triggerChance: t.triggerChance.toString() }) }}>Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => removeTrigger.mutate({ id: t.id })}>Delete</Button>
                          </td>
                        </tr>
                      )
                    )}
                    <tr>
                      <td className="px-3 py-3">
                        <select value={newTrigger.triggerType} onChange={(e) => setNewTrigger({ ...newTrigger, triggerType: e.target.value as "VET_PROCEDURE" | "TRAINING_TIER" })}
                          className="h-7 rounded border border-input bg-background px-2 text-xs">
                          <option value="VET_PROCEDURE">Vet Procedure</option>
                          <option value="TRAINING_TIER">Training Tier</option>
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        {newTrigger.triggerType === "TRAINING_TIER" && (
                          <Input type="number" min="0" value={newTrigger.minTierIndex} onChange={(e) => setNewTrigger({ ...newTrigger, minTierIndex: e.target.value })} className="h-7 text-sm w-16" placeholder="≥" />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <Input type="number" min="0" max="1" step="0.01" value={newTrigger.triggerChance} onChange={(e) => setNewTrigger({ ...newTrigger, triggerChance: e.target.value })} className="h-7 text-sm w-16" />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button size="sm" onClick={() => submitTrigger()} disabled={saveTrigger.isPending}>Add</Button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
        <section className="rounded-lg border border-border bg-card shadow-sm p-3 space-y-2">
          <label className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Description</label>
          <RichTextEditor
            key={editing.id ?? "new"}
            defaultContent={editing.description}
            onChange={(json) => setEditing({ ...editing, description: json })}
            placeholder="Describe this condition, prognosis, notes for players…"
            minHeight="7rem"
          />
        </section>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-xl font-semibold text-foreground">Health Conditions</h1>
        <Button onClick={() => setEditing(emptyCondition())}>+ New Condition</Button>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-md p-2">
      <section className="rounded-lg border border-border bg-card shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Name</th>
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Genetic</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Fatal</th>
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Behaviors</th>
              <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {conditions?.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-foreground">{c.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.conditionType === "ILLNESS" ? "Illness" : "Injury"}</td>
                <td className="px-3 py-2 text-center">{c.isGenetic ? <span className="text-primary">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center">{c.isFatal ? <span className="text-destructive">✓</span> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2 text-center text-muted-foreground">{c._count.behaviors}</td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                </td>
              </tr>
            ))}
            {conditions?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">No health conditions yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_authenticated/admin/games/$gameId/health-conditions")({
  component: HealthConditionsPage,
})
