"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEditItem, getEditScope, isManager } from "@/lib/auth/permissions";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";

const S = z.string().optional();
const schema = z.object({ id: S, code: S, zoneId: S, lot: S, systemId: S, title: S, location: S, responsible: S, crew: S, plannedHeadcount: S, plannedStart: S, plannedEnd: S, actualStart: S, actualEnd: S, manualProgress: S, unit: S, qtyPlanned: S, qtyDone: S, material: S, note: S });
const opt = (s?: string) => (s && s.trim() ? s.trim() : null);
const dt = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
function nm(s?: string, max?: number) {
  if (s === undefined || s.trim() === "") return null;
  const n = Number(s.replace(",", "."));
  if (Number.isNaN(n) || n < 0 || (max != null && n > max)) throw new Error("Valeur numérique invalide.");
  return n;
}
const refreshAll = () => ["/dashboard", "/suivi", "/taches", "/zones", "/rapports", "/planning", "/blocages"].forEach((p) => revalidatePath(p));

async function nextCode(projectId: string) {
  const rows = await prisma.workItem.findMany({ where: { projectId, kind: "TASK", code: { startsWith: "T" } }, select: { code: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code?.slice(1)) || 0), 0);
  return `T${String(max + 1).padStart(3, "0")}`;
}

// Création (responsables) et modification d'une tâche. Un chef d'équipe ne modifie que : réalisé, avancement, matériel, observation, dates réelles.
export async function saveTask(fd: FormData) {
  const user = await requireUser();
  const p = await currentProject();
  const d = schema.parse(Object.fromEntries(fd));
  const now = new Date();
  const qtyDone = nm(d.qtyDone), manual = nm(d.manualProgress, 100), hc = nm(d.plannedHeadcount);
  const plannedStart = dt(d.plannedStart), plannedEnd = dt(d.plannedEnd);
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) throw new Error("La date de fin prévue doit être postérieure au début.");

  if (!d.id) {
    if (!isManager(user)) throw new Error("Accès refusé");
    if (!d.zoneId || (d.lot !== "CFO" && d.lot !== "CFA") || !opt(d.title)) throw new Error("Zone, lot et tâche sont obligatoires.");
    const lot = d.lot;
    const qtyPlanned = nm(d.qtyPlanned);
    const status = computeStatus({ qtyPlanned, qtyDone, manualProgress: manual });
    const team = await prisma.team.findFirst({ where: { projectId: p.id, deletedAt: null, lot, zones: { some: { id: d.zoneId } } } });
    const item = await prisma.workItem.create({
      data: {
        projectId: p.id, kind: "TASK", code: opt(d.code) ?? (await nextCode(p.id)), zoneId: d.zoneId, lot, systemId: opt(d.systemId),
        title: opt(d.title), location: opt(d.location), responsible: opt(d.responsible), crew: opt(d.crew), teamId: team?.id ?? null,
        plannedHeadcount: hc == null ? null : Math.round(hc), plannedStart, plannedEnd, actualStart: dt(d.actualStart), actualEnd: dt(d.actualEnd),
        manualProgress: manual, unit: opt(d.unit) ?? "u", qtyPlanned, qtyDone, material: opt(d.material), note: opt(d.note),
        status, lastUpdatedAt: now, lastUpdatedById: user.id,
      },
    });
    await logAudit(user.id, "WorkItem", item.id, "CREATE_TASK", undefined, { code: item.code, title: item.title });
  } else {
    const item = await prisma.workItem.findUniqueOrThrow({ where: { id: d.id }, include: { issues: { where: { status: "OUVERT" }, select: { id: true } } } });
    if (!(await canEditItem(user, item))) throw new Error("Accès refusé");
    const manager = isManager(user);
    const qtyPlanned = manager ? nm(d.qtyPlanned) : item.qtyPlanned;
    const status = computeStatus({ qtyPlanned, qtyDone, manualProgress: manual, blocked: item.issues.length > 0 });
    let actualStart = dt(d.actualStart) ?? item.actualStart; // RG-07
    if (!actualStart && ((qtyDone ?? 0) > 0 || (manual ?? 0) > 0)) actualStart = now;
    let actualEnd = dt(d.actualEnd) ?? item.actualEnd;
    if (!actualEnd && status === "TERMINE") actualEnd = now;
    const data: Prisma.WorkItemUncheckedUpdateInput = { qtyDone, manualProgress: manual, material: opt(d.material), note: opt(d.note), actualStart, actualEnd, status, lastUpdatedAt: now, lastUpdatedById: user.id };
    if (manager) {
      if (!opt(d.title) || !d.zoneId || (d.lot !== "CFO" && d.lot !== "CFA")) throw new Error("Zone, lot et tâche sont obligatoires.");
      Object.assign(data, {
        zoneId: d.zoneId, lot: d.lot, systemId: opt(d.systemId), title: opt(d.title), location: opt(d.location), responsible: opt(d.responsible), crew: opt(d.crew),
        plannedHeadcount: hc == null ? null : Math.round(hc), plannedStart, plannedEnd, unit: opt(d.unit) ?? "u", qtyPlanned,
      });
    }
    await prisma.workItem.update({ where: { id: item.id }, data });
    await logAudit(user.id, "WorkItem", item.id, "UPDATE_TASK", { qtyDone: item.qtyDone, manualProgress: item.manualProgress, status: item.status }, { qtyDone, manualProgress: manual, status });
  }
  refreshAll();
  redirect("/taches");
}

export async function archiveTask(fd: FormData) {
  const user = await requireUser();
  if (!isManager(user)) throw new Error("Accès refusé");
  const id = String(fd.get("id"));
  await prisma.workItem.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(user.id, "WorkItem", id, "ARCHIVE_TASK");
  refreshAll();
  redirect("/taches");
}

// Effectif présent du jour par zone (feuille Zones du classeur A)
export async function saveHeadcount(fd: FormData) {
  const user = await requireUser();
  const d = z.object({
    zoneId: z.string(),
    present: z.coerce.number().int().min(0),
    planned: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).optional()),
  }).parse(Object.fromEntries(fd));
  const scope = await getEditScope(user);
  if (!scope.all && !scope.zones.has(d.zoneId)) throw new Error("Accès refusé");
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  await prisma.zoneHeadcount.upsert({
    where: { zoneId_date: { zoneId: d.zoneId, date } },
    update: { present: d.present, planned: d.planned ?? null },
    create: { zoneId: d.zoneId, date, present: d.present, planned: d.planned ?? null },
  });
  await logAudit(user.id, "ZoneHeadcount", d.zoneId, "UPSERT", undefined, { present: d.present });
  revalidatePath("/zones");
}