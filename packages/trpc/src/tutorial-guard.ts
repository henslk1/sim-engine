import { TRPCError } from "@trpc/server"
import { db } from "@sim-engine/db"
import { isTutorialMutationAllowed, TUTORIAL_CERTIFICATES } from "./tutorial-policy.js"

const denied = () => new TRPCError({ code: "FORBIDDEN", message: "This action is not available at your tutorial step. Continue from the dashboard." })

// Applied to the base procedure so new game mutations are closed automatically.
export async function guardTutorialMutation(userId: string | null, path: string, raw: unknown) {
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" })
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (path.startsWith("admin.")) {
    if (!await db.staffRole.findFirst({ where: { userId } })) throw denied()
    return
  }
  const players = await db.playerAccount.findMany({
    where: { userId },
    include: { seniority: true, tutorialAnimalPair: true },
  })
  // Do not let an input referencing somebody else's account bypass this gate.
  if (typeof input.playerAccountId === "string" && !players.some(p => p.id === input.playerAccountId)) throw denied()
  const player = players.find(p => p.gameId === input.gameId || p.id === input.playerAccountId)
    ?? players.find(p => !p.seniority?.tutorialCompleted)
  if (!player || player.seniority?.tutorialCompleted) return
  if (path === "tutorial.setDriverStep" || path === "tutorial.setup") return
  if (process.env.NODE_ENV !== "production" && ["tutorial.devReset", "tutorial.devFixStarter", "tutorial.devDeleteAccount"].includes(path)) return

  const step = player.seniority?.tutorialDriverStep
  if (step == null || !isTutorialMutationAllowed(step, path, input)) throw denied()
  const pair = player.tutorialAnimalPair
  if (!pair) throw denied()
  const tutorialAnimalId = step >= 164 ? pair.embryoId : pair.ancestorOneId
  if (input.animalId !== undefined && input.animalId !== tutorialAnimalId) throw denied()

  if (path === "care.perform") {
    const action = await db.careActionDef.findUnique({ where: { id: String(input.careActionDefId) } })
    if (!action || action.gameId !== player.gameId || (step === 25 && action.name !== "Groom")) throw denied()
  }
  if (path === "care.performLtc") {
    const record = await db.animalLongTermCareRecord.findUnique({ where: { id: String(input.ltcRecordId) } })
    if (record?.animalId !== tutorialAnimalId) throw denied()
  }
  if (path === "training.perform") {
    const [action, tier] = await Promise.all([
      db.trainingActionDef.findUnique({ where: { id: String(input.trainingActionDefId) } }),
      db.intensityTierDef.findUnique({ where: { id: String(input.intensityTierDefId) } }),
    ])
    if (action?.gameId !== player.gameId || tier?.gameId !== player.gameId) throw denied()
    const tiers = await db.intensityTierDef.findMany({ where: { gameId: player.gameId }, orderBy: { tierIndex: "asc" } })
    if ((step === 30 || step === 34) && tier.id !== tiers.at(-1)?.id) throw denied()
    if (step === 38 && tier.id !== tiers[0]?.id) throw denied()
  }
  if (path === "vet.issueCert") {
    const cert = await db.healthCertificateDef.findUnique({ where: { id: String(input.certDefId) } })
    const validTutorialCert = step >= 164 ? cert?.requiredForCompetition === true : !!cert && TUTORIAL_CERTIFICATES.includes(cert.name)
    if (cert?.gameId !== player.gameId || !validTutorialCert) throw denied()
  }
  if (path === "animal.setSecondaryDiscipline") {
    const discipline = await db.disciplineDef.findUnique({ where: { id: String(input.disciplineDefId) } })
    if (discipline?.gameId !== player.gameId || !discipline.isTutorialSelectable) throw denied()
  }
  if (path === "animal.setDiscipline") {
    const discipline = await db.disciplineDef.findUnique({ where: { id: String(input.disciplineDefId) } })
    if (discipline?.gameId !== player.gameId || !discipline.isConformation || discipline.name !== "Weanling Halter") throw denied()
  }
  if (path === "genetics.testLocus") {
    const locus = await db.locus.findUnique({
      where: { id: String(input.locusId) },
      select: { gameId: true, panelEntries: { select: { panelDef: { select: { panelType: true } } } } },
    })
    const requiredType = step === 125 ? "HEALTH" : "COLOR"
    if (locus?.gameId !== player.gameId || !locus.panelEntries.some(entry => entry.panelDef.panelType === requiredType)) throw denied()
  }
  if (path === "genetics.testPanel") {
    const panel = await db.geneticPanelDef.findUnique({
      where: { id: String(input.panelDefId) },
      select: { gameId: true, panelType: true },
    })
    const requiredType = step === 126 ? "HEALTH" : "COLOR"
    if (panel?.gameId !== player.gameId || panel.panelType !== requiredType) throw denied()
  }
  if (path === "breeding.cover.send") {
    if (input.sireId !== pair.ancestorTwoId || input.damId !== pair.ancestorOneId || input.fromListing !== true || input.price !== 0) throw denied()
  }
  if (path === "breeding.cover.accept") {
    const offer = await db.coverOffer.findUnique({
      where: { id: String(input.offerId) },
      select: { sireId: true, damId: true },
    })
    if (offer?.sireId !== pair.ancestorTwoId || offer.damId !== pair.ancestorOneId) throw denied()
  }
  if (path === "breeding.pregnancy.ultrasound") {
    const pregnancy = await db.pregnancy.findUnique({
      where: { id: String(input.pregnancyId) },
      select: { animalId: true },
    })
    if (pregnancy?.animalId !== pair.ancestorOneId) throw denied()
  }
  if (path === "breeding.pregnancy.birth") {
    const pregnancy = await db.pregnancy.findUnique({
      where: { id: String(input.pregnancyId) },
      select: { animalId: true, offspring: { select: { animalId: true } } },
    })
    const names = Array.isArray(input.names) ? input.names as Array<{ animalId?: unknown; name?: unknown }> : []
    const foalName = names.find(entry => entry.animalId === pair.embryoId)?.name
    if (pregnancy?.animalId !== pair.ancestorOneId || !pregnancy.offspring.some(entry => entry.animalId === pair.embryoId) || typeof foalName !== "string" || !foalName.trim()) throw denied()
  }
  if (path === "genetics.testCompleteProfile" && input.panelType !== "CONFORMATION") throw denied()
  if (path === "inventory.buy" || path === "inventory.equip") {
    const animal = await db.animal.findUnique({ where: { id: tutorialAnimalId } })
    const disciplineDefId = step >= 164 ? animal?.disciplineDefId : animal?.secondaryDisciplineDefId
    const requirements = disciplineDefId
      ? await db.disciplineEquipmentRequirement.findMany({ where: { disciplineDefId } }) : []
    const listing = path === "inventory.buy" ? await db.storeListing.findUnique({ where: { id: String(input.listingId) } }) : null
    const itemId = listing?.itemDefId ?? input.itemDefId
    if (path === "inventory.buy") {
      // Buying the animal's own active-treatment item (OTC medicine) is a separate,
      // always-available path from buying discipline equipment — not step-gated,
      // since illness can strike the foal on any unguided growth step.
      const activeTreatment = await db.animalTreatmentRecord.findFirst({
        where: { animalId: tutorialAnimalId, isActive: true },
        select: { treatmentDef: { select: { items: { select: { itemDefId: true } } } } },
      })
      if (activeTreatment?.treatmentDef.items.some(item => item.itemDefId === itemId)) {
        if (listing?.gameId !== player.gameId || (input.quantity ?? 1) !== 1) throw denied()
        return
      }
    }
    if (!requirements.some(r => r.itemDefId === itemId)) throw denied()
    if (path === "inventory.buy" && (listing?.gameId !== player.gameId || (input.quantity ?? 1) !== 1)) throw denied()
  }
}
