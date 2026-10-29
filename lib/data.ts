import 'server-only'
import type { Lot, WorkStatus } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  aggregateProgress,
  computeGap,
  computeProgress,
  computeRemaining,
  isActive,
  isLate,
  isOverrun,
} from '@/lib/rules'
import { getEditScope, scopeAllows, type SessionUser } from '@/lib/permissions'

export async function getProject() {
  const project = await prisma.project.findFirst({ where: { deletedAt: null }, orderBy: { createdAt: 'asc' } })
  if (!project) throw new Error('Aucun projet. Lancez le seed : pnpm db:seed')
  return project
}

export async function getReferenceData(projectId: string) {
  const [zones, levels, systems, teams] = await Promise.all([
    prisma.zone.findMany({ where: { projectId, deletedAt: null }, orderBy: { order: 'asc' } }),
    prisma.level.findMany({ where: { projectId, deletedAt: null }, orderBy: { order: 'asc' } }),
    prisma.system.findMany({ where: { projectId, deletedAt: null }, orderBy: [{ lot: 'asc' }, { order: 'asc' }] }),
    prisma.team.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ lot: 'asc' }, { name: 'asc' }],
      include: { leader: { select: { id: true, name: true } }, zones: { select: { id: true, code: true } } },
    }),
  ])
  return { zones, levels, systems, teams }
}

export type RefData = Awaited<ReturnType<typeof getReferenceData>>

export type WorkItemRow = {
  id: string
  code: string
  title: string
  zoneId: string
  zoneCode: string
  zoneName: string
  levelId: string
  levelLabel: string
  levelOrder: number
  lot: Lot
  systemId: string
  systemName: string
  teamId: string | null
  teamName: string | null
  plannedStart: string | null
  plannedEnd: string | null
  actualStart: string | null
  actualEnd: string | null
  status: WorkStatus
  unit: string
  qtyPlanned: number | null
  qtyDone: number | null
  weight: number
  material: string | null
  note: string | null
  progress: number | null
  gap: number | null
  remaining: number | null
  late: boolean
  overrun: boolean
  openIssues: number
  canEdit: boolean
  updatedAt: string
}

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export async function getWorkItems(projectId: string, user: SessionUser): Promise<WorkItemRow[]> {
  const [items, scope] = await Promise.all([
    prisma.workItem.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { code: 'asc' },
      include: {
        zone: { select: { code: true, name: true, order: true } },
        level: { select: { label: true, order: true } },
        system: { select: { name: true } },
        team: { select: { name: true } },
        _count: { select: { issues: { where: { status: 'OPEN' } } } },
      },
    }),
    getEditScope(user),
  ])
  const now = new Date()
  return items.map((w) => ({
    id: w.id,
    code: w.code,
    title: w.title,
    zoneId: w.zoneId,
    zoneCode: w.zone.code,
    zoneName: w.zone.name,
    levelId: w.levelId,
    levelLabel: w.level.label,
    levelOrder: w.level.order,
    lot: w.lot,
    systemId: w.systemId,
    systemName: w.system.name,
    teamId: w.teamId,
    teamName: w.team?.name ?? null,
    plannedStart: iso(w.plannedStart),
    plannedEnd: iso(w.plannedEnd),
    actualStart: iso(w.actualStart),
    actualEnd: iso(w.actualEnd),
    status: w.status,
    unit: w.unit,
    qtyPlanned: w.qtyPlanned,
    qtyDone: w.qtyDone,
    weight: w.weight,
    material: w.material,
    note: w.note,
    progress: computeProgress(w),
    gap: computeGap(w),
    remaining: computeRemaining(w),
    late: isLate(w, now),
    overrun: isOverrun(w),
    openIssues: w._count.issues,
    canEdit: scopeAllows(scope, w),
    updatedAt: w.updatedAt.toISOString(),
  }))
}

type AggInput = { qtyPlanned: number | null; qtyDone: number | null; weight: number; status: WorkStatus; unit: string }

export function summarize<T extends AggInput & { late?: boolean }>(
  items: T[],
  method: 'WEIGHTED_AVERAGE' | 'QUANTITY_SUM' = 'WEIGHTED_AVERAGE',
) {
  const active = items.filter(isActive)
  return {
    progress: aggregateProgress(items, method),
    total: items.length,
    active: active.length,
    done: items.filter((i) => i.status === 'TERMINE').length,
    inProgress: items.filter((i) => i.status === 'EN_COURS').length,
    blocked: items.filter((i) => i.status === 'BLOQUE').length,
    toCheck: items.filter((i) => i.status === 'A_VERIFIER' || i.status === 'NON_RENSEIGNE').length,
    late: items.filter((i) => i.late).length,
  }
}

export async function getDashboard(user: SessionUser) {
  const project = await getProject()
  const [rows, ref, openIssues, snapshots] = await Promise.all([
    getWorkItems(project.id, user),
    getReferenceData(project.id),
    prisma.issue.findMany({
      where: { status: 'OPEN', workItem: { projectId: project.id, deletedAt: null } },
      orderBy: { openedAt: 'desc' },
      take: 8,
      include: { workItem: { select: { id: true, code: true, title: true, lot: true, zone: { select: { code: true } } } } },
    }),
    prisma.progressSnapshot.findMany({
      where: { projectId: project.id, scope: { in: ['GLOBAL', 'LOT'] } },
      orderBy: { date: 'asc' },
    }),
  ])
  const method = project.aggregationMethod

  const global = summarize(rows, method)
  const cfo = summarize(rows.filter((r) => r.lot === 'CFO'), method)
  const cfa = summarize(rows.filter((r) => r.lot === 'CFA'), method)

  const byZone = ref.zones.map((z) => {
    const zr = rows.filter((r) => r.zoneId === z.id)
    return {
      id: z.id,
      code: z.code,
      name: z.name,
      cfo: aggregateProgress(zr.filter((r) => r.lot === 'CFO'), method),
      cfa: aggregateProgress(zr.filter((r) => r.lot === 'CFA'), method),
      global: aggregateProgress(zr, method),
    }
  })

  const statusCounts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1
    return acc
  }, {})

  const heatmap = {
    systems: ref.systems.map((s) => ({ id: s.id, name: s.name, lot: s.lot })),
    zones: ref.zones.map((z) => ({
      id: z.id,
      code: z.code,
      name: z.name,
      cells: ref.systems.map((s) =>
        aggregateProgress(rows.filter((r) => r.zoneId === z.id && r.systemId === s.id), method),
      ),
    })),
  }

  const late = rows
    .filter((r) => r.late)
    .sort((a, b) => (a.plannedEnd ?? '').localeCompare(b.plannedEnd ?? ''))
    .slice(0, 8)

  const byDate = new Map<string, { date: string; global?: number; CFO?: number; CFA?: number }>()
  for (const s of snapshots) {
    const key = s.date.toISOString().slice(0, 10)
    const entry = byDate.get(key) ?? { date: key }
    if (s.scope === 'GLOBAL') entry.global = s.progress
    else if (s.refId === 'CFO') entry.CFO = s.progress
    else if (s.refId === 'CFA') entry.CFA = s.progress
    byDate.set(key, entry)
  }

  return {
    project,
    global,
    cfo,
    cfa,
    byZone,
    statusCounts,
    heatmap,
    late,
    openIssues: openIssues.map((i) => ({
      id: i.id,
      reason: i.reason,
      openedAt: i.openedAt.toISOString(),
      workItemId: i.workItem.id,
      code: i.workItem.code,
      title: i.workItem.title,
      lot: i.workItem.lot,
      zoneCode: i.workItem.zone.code,
    })),
    curve: [...byDate.values()],
    totalOpenIssues: await prisma.issue.count({
      where: { status: 'OPEN', workItem: { projectId: project.id, deletedAt: null } },
    }),
  }
}
