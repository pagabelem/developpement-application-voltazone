import 'server-only'
import type { Prisma, PrismaClient } from '@prisma/client'

type Db = PrismaClient | Prisma.TransactionClient

export type FieldChange = { from: unknown; to: unknown }

/** Calcule les champs modifiés entre deux objets (valeurs sérialisables). */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const changes: Record<string, FieldChange> = {}
  for (const key of Object.keys(after)) {
    const a = before[key]
    const b = after[key]
    const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null)
    if (JSON.stringify(norm(a)) !== JSON.stringify(norm(b))) {
      changes[key] = { from: norm(a), to: norm(b) }
    }
  }
  return changes
}

export async function logAudit(
  db: Db,
  entry: { userId: string | null; entity: string; entityId: string; action: string; changes?: Prisma.InputJsonValue },
) {
  await db.auditLog.create({ data: entry })
}
