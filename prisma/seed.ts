import { PrismaClient, type Lot, type Role } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { aggregateProgress, computeStatus } from '../lib/rules'

const prisma = new PrismaClient()

const DEMO_PASSWORD = 'Voltazone2026!'

const ZONES = [
  'Accès principal / parvis',
  'Tribune Nord',
  'Tribune Sud',
  'Tribune Est',
  'Tribune Ouest',
  'Terrain / éclairage sportif',
  'Vestiaires joueurs',
  'Locaux techniques / TGBT',
  'Administration / médias',
  'Parking / annexes',
]

const LEVELS = ['RDC', 'Étage 1']

const SYSTEMS: { lot: Lot; name: string; unit: string; range: [number, number] }[] = [
  { lot: 'CFA', name: 'Prises RJ45', unit: 'u', range: [20, 120] },
  { lot: 'CFA', name: 'Caméras int.', unit: 'u', range: [4, 24] },
  { lot: 'CFA', name: 'Caméras ext.', unit: 'u', range: [2, 16] },
  { lot: 'CFA', name: "Contrôle d'accès", unit: 'u', range: [2, 14] },
  { lot: 'CFA', name: 'Détection incendie', unit: 'u', range: [10, 60] },
  { lot: 'CFA', name: 'Sirènes', unit: 'u', range: [2, 12] },
  { lot: 'CFA', name: 'Sonorisation', unit: 'u', range: [4, 30] },
  { lot: 'CFO', name: 'Éclairage', unit: 'u', range: [30, 160] },
  { lot: 'CFO', name: 'Prises 220V', unit: 'u', range: [20, 90] },
  { lot: 'CFO', name: 'Tableaux électriques', unit: 'u', range: [1, 4] },
  { lot: 'CFO', name: 'Chemins de câbles', unit: 'm', range: [80, 420] },
]

/** Générateur pseudo-aléatoire déterministe (mulberry32) pour des données reproductibles. */
function rng(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = rng(2026)
const between = (min: number, max: number) => Math.round(min + rand() * (max - min))
const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000)

async function main() {
  console.log('Nettoyage des données existantes…')
  await prisma.auditLog.deleteMany()
  await prisma.progressSnapshot.deleteMany()
  await prisma.attachment.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.progressEntry.deleteMany()
  await prisma.workItem.deleteMany()
  await prisma.team.deleteMany()
  await prisma.system.deleteMany()
  await prisma.level.deleteMany()
  await prisma.zone.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const userDefs: { name: string; email: string; role: Role; lot: Lot | null }[] = [
    { name: 'Alice Martin', email: 'admin@voltazone.fr', role: 'ADMIN', lot: null },
    { name: 'Bruno Lefèvre', email: 'conducteur@voltazone.fr', role: 'CONDUCTEUR', lot: null },
    { name: 'Karim Benali', email: 'chef.cfo@voltazone.fr', role: 'CHEF_CFO', lot: 'CFO' },
    { name: 'Sophie Durand', email: 'chef.cfa@voltazone.fr', role: 'CHEF_CFA', lot: 'CFA' },
    { name: 'Marc Olivier (MOA)', email: 'client@voltazone.fr', role: 'CLIENT', lot: null },
    { name: 'Thomas Girard', email: 'chef.cfo2@voltazone.fr', role: 'CHEF_CFO', lot: 'CFO' },
    { name: 'Inès Moreau', email: 'chef.cfa2@voltazone.fr', role: 'CHEF_CFA', lot: 'CFA' },
  ]
  const users = await Promise.all(
    userDefs.map((u) => prisma.user.create({ data: { ...u, passwordHash } })),
  )
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]))

  const projectStart = new Date('2026-06-01T00:00:00Z')
  const project = await prisma.project.create({
    data: {
      name: 'Stade municipal — Lots CFO / CFA',
      client: 'Ville — Maîtrise d’ouvrage',
      siteName: 'Stade municipal',
      startDate: projectStart,
      endDate: new Date('2027-03-31T00:00:00Z'),
      status: 'EN_COURS',
    },
  })

  const zones = []
  for (let i = 0; i < ZONES.length; i++) {
    zones.push(
      await prisma.zone.create({
        data: {
          projectId: project.id,
          code: `Z${String(i + 1).padStart(2, '0')}`,
          name: ZONES[i],
          building: i >= 1 && i <= 4 ? 'Tribunes' : i === 5 ? 'Terrain' : 'Bâtiment principal',
          order: i + 1,
        },
      }),
    )
  }

  const levels = []
  for (let i = 0; i < LEVELS.length; i++) {
    levels.push(
      await prisma.level.create({ data: { projectId: project.id, label: LEVELS[i], order: i + 1 } }),
    )
  }

  const systems = []
  for (let i = 0; i < SYSTEMS.length; i++) {
    const s = SYSTEMS[i]
    systems.push(
      await prisma.system.create({
        data: { projectId: project.id, lot: s.lot, name: s.name, defaultUnit: s.unit, order: i + 1 },
      }),
    )
  }

  const firstHalf = zones.slice(0, 5).map((z) => ({ id: z.id }))
  const secondHalf = zones.slice(5).map((z) => ({ id: z.id }))
  const teams = {
    CFO1: await prisma.team.create({
      data: {
        projectId: project.id, lot: 'CFO', name: 'Équipe CFO 1', leaderId: byEmail['chef.cfo@voltazone.fr'].id,
        matricule: 'CFO-101', headcount: 8, phone: '06 12 34 56 78', startDate: projectStart, zones: { connect: firstHalf },
      },
    }),
    CFO2: await prisma.team.create({
      data: {
        projectId: project.id, lot: 'CFO', name: 'Équipe CFO 2', leaderId: byEmail['chef.cfo2@voltazone.fr'].id,
        matricule: 'CFO-102', headcount: 6, phone: '06 22 33 44 55', startDate: addDays(projectStart, 30), zones: { connect: secondHalf },
      },
    }),
    CFA1: await prisma.team.create({
      data: {
        projectId: project.id, lot: 'CFA', name: 'Équipe CFA 1', leaderId: byEmail['chef.cfa@voltazone.fr'].id,
        matricule: 'CFA-201', headcount: 5, phone: '06 98 76 54 32', startDate: addDays(projectStart, 45), zones: { connect: firstHalf },
      },
    }),
    CFA2: await prisma.team.create({
      data: {
        projectId: project.id, lot: 'CFA', name: 'Équipe CFA 2', leaderId: byEmail['chef.cfa2@voltazone.fr'].id,
        matricule: 'CFA-202', headcount: 4, phone: '06 45 67 89 01', startDate: addDays(projectStart, 60), zones: { connect: secondHalf },
      },
    }),
  }

  const today = new Date('2026-10-29T00:00:00Z')
  const items: Parameters<typeof prisma.workItem.create>[0]['data'][] = []
  let counter = 1

  for (const [zi, zone] of zones.entries()) {
    for (const [li, level] of levels.entries()) {
      for (const [si, system] of systems.entries()) {
        const def = SYSTEMS[si]
        const isCfo = def.lot === 'CFO'
        // CFO démarre en premier, CFA suit avec un décalage ; chaque zone est décalée.
        const startOffset = zi * 12 + li * 10 + (isCfo ? 0 : 50) + (si % 4) * 5
        const duration = between(25, 60)
        const plannedStart = addDays(projectStart, startOffset)
        const plannedEnd = addDays(plannedStart, duration)

        let qtyPlanned: number | null = between(def.range[0], def.range[1])
        const roll = rand()
        if (roll < 0.03) qtyPlanned = null
        else if (roll < 0.07 || (zi === 5 && li === 1 && !isCfo && si > 2)) qtyPlanned = 0

        const elapsed = (today.getTime() - plannedStart.getTime()) / (plannedEnd.getTime() - plannedStart.getTime())
        let qtyDone: number | null = null
        if (qtyPlanned !== null) {
          if (qtyPlanned === 0) qtyDone = 0
          else if (rand() < 0.05) qtyDone = null
          else {
            const ratio = Math.max(0, Math.min(1.05, elapsed * (0.6 + rand() * 0.55)))
            qtyDone = elapsed <= 0 ? 0 : Math.round(qtyPlanned * ratio)
          }
        }

        const status = computeStatus({ qtyPlanned, qtyDone })
        const team = isCfo ? (zi < 5 ? teams.CFO1 : teams.CFO2) : zi < 5 ? teams.CFA1 : teams.CFA2

        items.push({
          projectId: project.id,
          code: `T${String(counter++).padStart(3, '0')}`,
          zoneId: zone.id,
          levelId: level.id,
          lot: def.lot,
          systemId: system.id,
          title: `${def.name} — ${zone.code} ${level.label}`,
          teamId: team.id,
          plannedStart,
          plannedEnd,
          actualStart: (qtyDone ?? 0) > 0 ? addDays(plannedStart, between(0, 6)) : null,
          actualEnd: status === 'TERMINE' ? addDays(plannedEnd, between(-5, 8)) : null,
          status,
          unit: def.unit,
          qtyPlanned,
          qtyDone,
          weight: def.name === 'Tableaux électriques' ? 2 : 1,
          material: def.unit === 'm' ? 'Chemin de câbles galvanisé 300 mm' : null,
        })
      }
    }
  }

  await prisma.workItem.createMany({ data: items as never })
  const created = await prisma.workItem.findMany({ where: { projectId: project.id }, orderBy: { code: 'asc' } })
  console.log(`${created.length} lignes de suivi générées`)

  // Blocages ouverts et résolus
  const blockable = created.filter((w) => w.status === 'EN_COURS')
  const reasons = [
    { reason: 'Attente livraison matériel', description: 'Caméras dômes en rupture chez le fournisseur.' },
    { reason: 'Zone non accessible', description: 'Échafaudage gros œuvre en place, accès interdit.' },
    { reason: 'Plan non validé', description: 'Implantation à confirmer par le bureau de contrôle.' },
    { reason: 'Réservation manquante', description: 'Réservation dalle non réalisée par le lot GO.' },
    { reason: 'Conflit avec lot plomberie', description: 'Réseau CVC sur le tracé du chemin de câbles.' },
  ]
  for (let i = 0; i < reasons.length && i * 7 < blockable.length; i++) {
    const wi = blockable[i * 7]
    await prisma.issue.create({
      data: { workItemId: wi.id, ...reasons[i], owner: 'Bruno Lefèvre', openedById: byEmail['conducteur@voltazone.fr'].id, openedAt: addDays(today, -between(1, 14)) },
    })
    await prisma.workItem.update({ where: { id: wi.id }, data: { status: 'BLOQUE' } })
  }
  for (let i = 0; i < 2; i++) {
    const wi = created.filter((w) => w.status === 'TERMINE')[i * 5]
    if (!wi) continue
    await prisma.issue.create({
      data: {
        workItemId: wi.id, reason: 'Câble endommagé', description: 'Remplacement d’un tronçon nécessaire.',
        status: 'RESOLVED', openedById: byEmail['chef.cfo@voltazone.fr'].id, openedAt: addDays(today, -40),
        resolvedById: byEmail['conducteur@voltazone.fr'].id, resolvedAt: addDays(today, -32), resolution: 'Tronçon remplacé et testé.',
      },
    })
  }

  // Relevés d'avancement
  const entries = created
    .filter((w) => (w.qtyDone ?? 0) > 0)
    .slice(0, 60)
    .map((w, i) => ({
      workItemId: w.id,
      userId: w.lot === 'CFO' ? byEmail['chef.cfo@voltazone.fr'].id : byEmail['chef.cfa@voltazone.fr'].id,
      previousQty: Math.max(0, (w.qtyDone ?? 0) - between(1, 10)),
      newQty: w.qtyDone,
      source: i % 3 === 0 ? 'terrain' : 'web',
      createdAt: addDays(today, -between(0, 20)),
    }))
  await prisma.progressEntry.createMany({ data: entries })

  // Instantanés pour la courbe en S (90 derniers jours)
  const finalItems = await prisma.workItem.findMany({ where: { projectId: project.id } })
  const finalGlobal = aggregateProgress(finalItems) ?? 0
  const finalCfo = aggregateProgress(finalItems.filter((w) => w.lot === 'CFO')) ?? 0
  const finalCfa = aggregateProgress(finalItems.filter((w) => w.lot === 'CFA')) ?? 0
  const snapshots = []
  for (let d = 90; d >= 1; d--) {
    const t = (90 - d) / 90
    const curve = 1 / (1 + Math.exp(-8 * (t - 0.5)))
    const date = addDays(today, -d)
    snapshots.push(
      { projectId: project.id, date, scope: 'GLOBAL', refId: '', label: 'Global', progress: finalGlobal * curve },
      { projectId: project.id, date, scope: 'LOT', refId: 'CFO', label: 'CFO', progress: finalCfo * curve },
      { projectId: project.id, date, scope: 'LOT', refId: 'CFA', label: 'CFA', progress: finalCfa * Math.pow(curve, 1.4) },
    )
  }
  await prisma.progressSnapshot.createMany({ data: snapshots })

  await prisma.auditLog.create({
    data: {
      userId: byEmail['admin@voltazone.fr'].id, entity: 'Project', entityId: project.id, action: 'SEED',
      changes: { message: 'Initialisation du chantier : 10 zones, 2 niveaux, 11 systèmes, 220 lignes' },
    },
  })

  console.log('Seed terminé. Mot de passe des comptes de démo :', DEMO_PASSWORD)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
