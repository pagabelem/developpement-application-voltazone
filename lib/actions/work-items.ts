'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma, WorkItem } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { diff, logAudit } from '@/lib/audit'
import { autoActualDates, computeStatus } from '@/lib/rules'
import {
  assertCanEditWorkItem,
  ForbiddenError,
  isManager,
  requireUser,
  type SessionUser,
} from '@/lib/permissions'

export type ActionResult = { ok: true } | { ok: false; error: string }

const qty = z.number().finite().min(0, 'La quantité ne peut pas être négative.').max(1_000_000).nullable()
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .transform((v) => (v ? new Date(`${v}T00:00:00.000Z`) : null))

function fail(error: unknown): ActionResult {
  if (error instanceof ForbiddenError) return { ok: false, error: error.message }
  if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? 'Données invalides.' }
  console.error('[voltazone] action error', error)
  return { ok: false, error: 'Une erreur est survenue. Réessayez.' }
}

function revalidateAll() {
  for (const p of ['/', '/suivi', '/zones', '/planning', '/blocages', '/terrain', '/rapports']) revalidatePath(p)
}

/**
 * Applique une modification sur une tâche : recalcul du statut, dates réelles auto,
 * historique d'avancement et journal d'audit, le tout dans une transaction.
 */
async function applyChange(
  user: SessionUser,
  item: WorkItem,
  patch: Partial<WorkItem>,
  source: string,
  note?: string | null,
) {
  await prisma.$transaction(async (tx) => {
    const openIssues = await tx.issue.count({ where: { workItemId: item.id, status: 'OPEN' } })
    const merged = { ...item, ...patch }
    const status = computeStatus(merged, openIssues > 0)
    const dates =
      'actualStart' in patch || 'actualEnd' in patch
        ? { actualStart: merged.actualStart, actualEnd: merged.actualEnd }
        : autoActualDates(item, { qtyDone: merged.qtyDone, status })
    const data = { ...patch, ...dates, status }
    const changes = diff(item as unknown as Record<string, unknown>, data as Record<string, unknown>)
    if (Object.keys(changes).length === 0) return

    await tx.workItem.update({ where: { id: item.id }, data: { ...data, updatedById: user.id } })

    for (const field of ['qtyDone', 'qtyPlanned'] as const) {
      if (field in changes) {
        await tx.progressEntry.create({
          data: {
            workItemId: item.id,
            userId: user.id,
            field,
            previousQty: item[field],
            newQty: merged[field],
            note: note ?? null,
            source,
          },
        })
      }
    }
    await logAudit(tx, {
      userId: user.id,
      entity: 'WorkItem',
      entityId: item.id,
      action: `update:${source}`,
      changes: changes as Prisma.InputJsonValue,
    })
  })
}

async function loadItem(id: string) {
  const item = await prisma.workItem.findFirst({ where: { id, deletedAt: null } })
  if (!item) throw new ForbiddenError('Tâche introuvable ou archivée.')
  return item
}

const quickSchema = z.object({
  id: z.string().min(1),
  field: z.enum(['qtyPlanned', 'qtyDone']),
  value: qty,
  source: z.enum(['web', 'terrain']).default('web'),
  note: z.string().max(500).nullish(),
})

/** Édition rapide « Sur plan » (prévu) / « Sur site » (réalisé). */
export async function quickUpdateQty(input: z.input<typeof quickSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const data = quickSchema.parse(input)
    const item = await loadItem(data.id)
    await assertCanEditWorkItem(user, item)
    if (data.field === 'qtyPlanned' && !isManager(user.role)) {
      throw new ForbiddenError('Seuls le conducteur et l’administrateur modifient les quantités prévues.')
    }
    await applyChange(user, item, { [data.field]: data.value }, data.source, data.note)
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const fullSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, 'Le libellé est requis.').max(200),
  teamId: z.string().nullable(),
  plannedStart: dateStr,
  plannedEnd: dateStr,
  actualStart: dateStr,
  actualEnd: dateStr,
  unit: z.string().trim().min(1).max(10),
  qtyPlanned: qty,
  qtyDone: qty,
  weight: z.number().finite().min(0).max(1000),
  material: z.string().trim().max(200).nullable(),
  note: z.string().trim().max(2000).nullable(),
})

export type WorkItemFormInput = z.input<typeof fullSchema>

const CHEF_FIELDS = ['qtyDone', 'actualStart', 'actualEnd', 'material', 'note'] as const

export async function updateWorkItem(input: WorkItemFormInput): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const data = fullSchema.parse(input)
    const item = await loadItem(data.id)
    await assertCanEditWorkItem(user, item)
    if (data.plannedStart && data.plannedEnd && data.plannedEnd < data.plannedStart) {
      return { ok: false, error: 'La fin prévue doit être postérieure au début prévu.' }
    }
    const { id: _id, ...rest } = data
    const patch: Partial<WorkItem> = isManager(user.role)
      ? rest
      : Object.fromEntries(CHEF_FIELDS.map((k) => [k, rest[k]]))
    await applyChange(user, item, patch, 'fiche', null)
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function archiveWorkItem(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser()
    if (!isManager(user.role)) throw new ForbiddenError()
    const item = await loadItem(id)
    await prisma.$transaction([
      prisma.workItem.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } }),
      prisma.auditLog.create({
        data: { userId: user.id, entity: 'WorkItem', entityId: id, action: 'archive', changes: { code: item.code } },
      }),
    ])
    revalidateAll()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Détail d'une tâche pour la fiche latérale. */
export async function getWorkItemDetail(id: string) {
  await requireUser()
  const item = await prisma.workItem.findFirst({
    where: { id, deletedAt: null },
    include: {
      progressEntries: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { user: { select: { name: true } } },
      },
      issues: { orderBy: { openedAt: 'desc' }, include: { openedBy: { select: { name: true } } } },
      attachments: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, contentType: true, size: true, createdAt: true },
      },
    },
  })
  if (!item) return null
  return {
    history: item.progressEntries.map((p) => ({
      id: p.id,
      field: p.field,
      previousQty: p.previousQty,
      newQty: p.newQty,
      note: p.note,
      source: p.source,
      user: p.user.name,
      createdAt: p.createdAt.toISOString(),
    })),
    issues: item.issues.map((i) => ({
      id: i.id,
      reason: i.reason,
      description: i.description,
      owner: i.owner,
      status: i.status,
      openedBy: i.openedBy.name,
      openedAt: i.openedAt.toISOString(),
      resolution: i.resolution,
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    })),
    attachments: item.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
  }
}

export type WorkItemDetail = NonNullable<Awaited<ReturnType<typeof getWorkItemDetail>>>
