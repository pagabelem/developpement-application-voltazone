import { prisma } from "@/lib/db";

const clean = (v: unknown) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export async function logAudit(userId: string | null, entity: string, entityId: string, action: string, before?: unknown, after?: unknown) {
  await prisma.auditLog.create({ data: { userId, entity, entityId, action, before: clean(before), after: clean(after) } });
}