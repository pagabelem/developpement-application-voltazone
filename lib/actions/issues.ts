'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { logAudit } from '@/lib/audit'
import { computeStatus } from '@/lib/rules'
import { assertCanEditWorkItem, ForbiddenError, requireUser } from '@/lib/permissions'
import type { ActionResult } from '@/lib/actions/work-items'

const openSchema = z.object({
  workItemId: z.string().min(1),
  reason: z.string().trim().min(3, 'Indiquez le motif du blocage.').max(200),
  description: z.string().trim().max(2000).nullish(),
  owner: z.string().trim().max(120).nullish(),
})

function revalidate() {
  for (const p of ['/', '/suivi', '/blocages', '/zones', '/terrain']) revalidatePath(p)
}

function fail(e: unknown): ActionResult {
  if (e instanceof ForbiddenError) return { ok: false, error: e.message }
  if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? 'Données invalides.' }
  console.error('[voltazone] issue error', e)
  return { ok: false, error: 'Une erreur est survenue.' }
}

export async function openIssue(input: z.input<typeof openSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const data = openSchema.parse(input)
    const item = await prisma.workItem.findFirst({ where: { id: data.workItemId, deletedAt: null } })
    if (!item) throw new ForbiddenError('Tâche introuvable.')
    await assertCanEditWorkItem(user, item)
    await prisma.$transaction(async (tx) => {
      const issue = await tx.issue.create({
        data: {
          workItemId: item.id,
          reason: data.reason,
          description: data.description ?? null,
          owner: data.owner ?? null,
          openedById: user.id,
        },
      })
      await tx.workItem.update({ where: { id: item.id }, data: { status: 'BLOQUE', updatedById: user.id } })
      await logAudit(tx, {
        userId: user.id,
        entity: 'Issue',
        entityId: issue.id,
        action: 'open',
        changes: { workItem: item.code, reason: data.reason, status: { from: item.status, to: 'BLOQUE' } },
      })
    })
    revalidate()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const resolveSchema = z.object({
  id: z.string().min(1),
  resolution: z.string().trim().min(3, 'Décrivez la levée du blocage.').max(2000),
})

export async function resolveIssue(input: z.input<typeof resolveSchema>): Promise<ActionResult> {
  try {
    const user = await requireUser()
    const data = resolveSchema.parse(input)
    const issue = await prisma.issue.findUnique({ where: { id: data.id }, include: { workItem: true } })
    if (!issue || issue.status !== 'OPEN') throw new ForbiddenError('Blocage introuvable ou déjà levé.')
    await assertCanEditWorkItem(user, issue.workItem)
    await prisma.$transaction(async (tx) => {
      await tx.issue.update({
        where: { id: issue.id },
        data: { status: 'RESOLVED', resolution: data.resolution, resolvedAt: new Date(), resolvedById: user.id },
      })
      const remaining = await tx.issue.count({ where: { workItemId: issue.workItemId, status: 'OPEN' } })
      const status = computeStatus(issue.workItem, remaining > 0)
      await tx.workItem.update({ where: { id: issue.workItemId }, data: { status, updatedById: user.id } })
      await logAudit(tx, {
        userId: user.id,
        entity: 'Issue',
        entityId: issue.id,
        action: 'resolve',
        changes: { workItem: issue.workItem.code, resolution: data.resolution, status: { from: 'BLOQUE', to: status } },
      })
    })
    revalidate()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
