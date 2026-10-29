import 'server-only'
import { redirect } from 'next/navigation'
import type { Lot, Role } from '@prisma/client'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

export type SessionUser = { id: string; name: string; email: string; role: Role; lot: Lot | null }

export class ForbiddenError extends Error {
  constructor(message = 'Action non autorisée pour votre rôle.') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return session.user
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/connexion')
  return user
}

export const isManager = (role: Role) => role === 'ADMIN' || role === 'CONDUCTEUR'
export const isChef = (role: Role) => role === 'CHEF_CFO' || role === 'CHEF_CFA'
export const isReadOnly = (role: Role) => role === 'CLIENT'

export async function requireManager(): Promise<SessionUser> {
  const user = await requireUser()
  if (!isManager(user.role)) throw new ForbiddenError()
  return user
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') throw new ForbiddenError()
  return user
}

/** Zones affectées aux équipes dont l'utilisateur est chef. */
export async function getChefZoneIds(userId: string): Promise<string[]> {
  const teams = await prisma.team.findMany({
    where: { leaderId: userId, deletedAt: null },
    select: { zones: { select: { id: true } } },
  })
  return [...new Set(teams.flatMap((t) => t.zones.map((z) => z.id)))]
}

/** Périmètre d'édition : null = tout, sinon filtre lot + zones. */
export async function getEditScope(user: SessionUser): Promise<{ lot: Lot; zoneIds: string[] } | null | 'none'> {
  if (isManager(user.role)) return null
  if (isReadOnly(user.role) || !user.lot) return 'none'
  return { lot: user.lot, zoneIds: await getChefZoneIds(user.id) }
}

export function scopeAllows(
  scope: Awaited<ReturnType<typeof getEditScope>>,
  item: { lot: Lot; zoneId: string },
): boolean {
  if (scope === null) return true
  if (scope === 'none') return false
  return scope.lot === item.lot && scope.zoneIds.includes(item.zoneId)
}

/** Contrôle serveur : un chef d'équipe ne modifie que les tâches de son lot et de ses zones. */
export async function assertCanEditWorkItem(user: SessionUser, item: { lot: Lot; zoneId: string }) {
  const scope = await getEditScope(user)
  if (!scopeAllows(scope, item)) {
    throw new ForbiddenError("Cette tâche n'appartient pas à votre lot ou à vos zones.")
  }
}
