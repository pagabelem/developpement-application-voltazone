import type { Lot, Prisma, Status } from "@prisma/client";

export function buildWhere(projectId: string, sp: Record<string, string | undefined>): Prisma.WorkItemWhereInput {
  return {
    projectId,
    deletedAt: null,
    ...(sp.kind === "GRID" || sp.kind === "TASK" ? { kind: sp.kind } : {}),
    ...(sp.zone ? { zoneId: sp.zone } : {}),
    ...(sp.level ? { levelId: sp.level } : {}),
    ...(sp.lot ? { lot: sp.lot as Lot } : {}),
    ...(sp.open === "1" ? { status: { not: "TERMINE" as Status } } : {}), // tâches restantes
    ...(sp.status ? { status: sp.status as Status } : {}),
    ...(sp.late === "1" ? { plannedEnd: { lt: new Date() }, status: { not: "TERMINE" as Status } } : {}),
  };
}

export function auditWhere(f: Record<string, string | undefined>): Prisma.AuditLogWhereInput {
  return {
    ...(f.entity ? { entity: f.entity } : {}),
    ...(f.action ? { action: f.action } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.from || f.to
      ? { createdAt: { ...(f.from ? { gte: new Date(`${f.from}T00:00:00Z`) } : {}), ...(f.to ? { lte: new Date(`${f.to}T23:59:59.999Z`) } : {}) } }
      : {}),
  };
}