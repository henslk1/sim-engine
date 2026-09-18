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
  if (input.animalId !== undefined && input.animalId !== pair.ancestorOneId) throw denied()

  if (path === "care.perform") {
    const action = await db.careActionDef.findUnique({ where: { id: String(input.careActionDefId) } })
    if (!action || action.gameId !== player.gameId || (step === 25 && action.name !== "Groom")) throw denied()
  }
  if (path === "care.performLtc") {
    const record = await db.animalLongTermCareRecord.findUnique({ where: { id: String(input.ltcRecordId) } })
    if (record?.animalId !== pair.ancestorOneId) throw denied()
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
    if (cert?.gameId !== player.gameId || !TUTORIAL_CERTIFICATES.includes(cert.name)) throw denied()
  }
  if (path === "animal.setSecondaryDiscipline") {
    const discipline = await db.disciplineDef.findUnique({ where: { id: String(input.disciplineDefId) } })
    if (discipline?.gameId !== player.gameId || !discipline.isTutorialSelectable) throw denied()
  }
  if (path === "inventory.buy" || path === "inventory.equip") {
    const mare = await db.animal.findUnique({ where: { id: pair.ancestorOneId } })
    const requirements = mare?.secondaryDisciplineDefId
      ? await db.disciplineEquipmentRequirement.findMany({ where: { disciplineDefId: mare.secondaryDisciplineDefId } }) : []
    const listing = path === "inventory.buy" ? await db.storeListing.findUnique({ where: { id: String(input.listingId) } }) : null
    const itemId = listing?.itemDefId ?? input.itemDefId
    if (!requirements.some(r => r.itemDefId === itemId)) throw denied()
    if (path === "inventory.buy" && (listing?.gameId !== player.gameId || (input.quantity ?? 1) !== 1)) throw denied()
  }
}
