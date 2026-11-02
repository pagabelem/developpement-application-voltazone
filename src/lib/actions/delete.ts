"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/permissions";
import { auditWhere, buildWhere } from "@/lib/filters";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";
import { parseDay } from "@/lib/domain/rapport";
import type { Prisma } from "@prisma/client";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { redirect } from "next/navigation";

const refresh = () => revalidatePath("/", "layout");
const id = (fd: FormData) => String(fd.get("id") ?? "");

async function admin() {
  const u = await requireUser();
  if (!isAdmin(u)) throw new Error("Suppression réservée à l'administrateur.");
  return u;
}
function need(fd: FormData, phrase: string) {
  if (String(fd.get("confirm") ?? "").trim() !== phrase) throw new Error(`Confirmation incorrecte : il fallait taper « ${phrase} ».`);
}

// --- Lignes de grille et tâches (Suivi, Tâches, Planning)
export async function deleteWorkItem(fd: FormData) {
  const u = await admin();
  const item = await prisma.workItem.findUnique({ where: { id: id(fd) }, include: { zone: true, system: true } });
  if (!item) return;
  await prisma.workItem.delete({ where: { id: item.id } }); // historique et blocages supprimés en cascade
  await logAudit(u.id, "WorkItem", item.id, "DELETE", { kind: item.kind, code: item.code, zone: item.zone.code, system: item.system?.name, title: item.title });
  refresh();
}

// Suppression groupée selon les filtres actifs (ou totale si aucun filtre)
export async function deleteItemsByFilter(fd: FormData) {
  const u = await admin();
  const p = await currentProject();
  const f = Object.fromEntries(fd) as Record<string, string | undefined>;
  const kind = f.kind === "TASK" ? "TASK" : "GRID";
  const hasFilter = ["zone", "level", "lot", "status", "late"].some((k) => f[k]);
  need(fd, hasFilter ? "SUPPRIMER" : "SUPPRIMER TOUT");
  const r = await prisma.workItem.deleteMany({ where: { ...buildWhere(p.id, { ...f, kind }), deletedAt: undefined } });
  await logAudit(u.id, "WorkItem", p.id, "DELETE_MANY", undefined, { kind, criteres: Object.fromEntries(["zone", "level", "lot", "status", "late"].filter((k) => f[k]).map((k) => [k, f[k]])), supprimees: r.count });
  refresh();
}

// --- Blocages
export async function deleteIssue(fd: FormData) {
  const u = await admin();
  const issue = await prisma.issue.findUnique({ where: { id: id(fd) } });
  if (!issue) return;
  await prisma.issue.delete({ where: { id: issue.id } });
  const it = await prisma.workItem.findUniqueOrThrow({ where: { id: issue.workItemId }, include: { issues: { where: { status: "OUVERT" }, select: { id: true } } } });
  await prisma.workItem.update({ where: { id: it.id }, data: { status: computeStatus({ qtyPlanned: it.qtyPlanned, qtyDone: it.qtyDone, manualProgress: it.manualProgress, blocked: it.issues.length > 0 }) } });
  await logAudit(u.id, "Issue", issue.id, "DELETE", { description: issue.description, status: issue.status });
  refresh();
}

// --- Zones : l'admin doit taper le code de la zone
export async function deleteZone(fd: FormData) {
  const u = await admin();
  const zone = await prisma.zone.findUnique({ where: { id: id(fd) } });
  if (!zone) return;
  need(fd, zone.code);
  const [r] = await prisma.$transaction([prisma.workItem.deleteMany({ where: { zoneId: zone.id } }), prisma.zone.delete({ where: { id: zone.id } })]);
  await logAudit(u.id, "Zone", zone.id, "DELETE", { code: zone.code, name: zone.name }, { lignesSupprimees: r.count });
  refresh();
}

// --- Équipes
export async function deleteTeam(fd: FormData) {
  const u = await admin();
  const team = await prisma.team.findUnique({ where: { id: id(fd) } });
  if (!team) return;
  await prisma.$transaction([prisma.workItem.updateMany({ where: { teamId: team.id }, data: { teamId: null } }), prisma.team.delete({ where: { id: team.id } })]);
  await logAudit(u.id, "Team", team.id, "DELETE", { name: team.name, lot: team.lot });
  refresh();
}

// --- Paramètres : niveaux, systèmes, utilisateurs
export async function deleteLevel(fd: FormData) {
  const u = await admin();
  const lvl = await prisma.level.findUnique({ where: { id: id(fd) } });
  if (!lvl) return;
  const [r] = await prisma.$transaction([prisma.workItem.deleteMany({ where: { levelId: lvl.id, kind: "GRID" } }), prisma.level.delete({ where: { id: lvl.id } })]);
  await logAudit(u.id, "Level", lvl.id, "DELETE", { label: lvl.label }, { lignesSupprimees: r.count });
  refresh();
}

export async function deleteSystem(fd: FormData) {
  const u = await admin();
  const sys = await prisma.system.findUnique({ where: { id: id(fd) } });
  if (!sys) return;
  const [r] = await prisma.$transaction([prisma.workItem.deleteMany({ where: { systemId: sys.id, kind: "GRID" } }), prisma.system.delete({ where: { id: sys.id } })]);
  await logAudit(u.id, "System", sys.id, "DELETE", { lot: sys.lot, name: sys.name }, { lignesSupprimees: r.count });
  refresh();
}

export async function deleteUser(fd: FormData) {
  const u = await admin();
  const target = id(fd);
  if (target === u.id) throw new Error("Vous ne pouvez pas supprimer votre propre compte.");
  const usr = await prisma.user.findUnique({ where: { id: target } });
  if (!usr) return;
  // les saisies et blocages de cet utilisateur sont rattachés à l'admin qui supprime
  await prisma.$transaction([
    prisma.progressEntry.updateMany({ where: { authorId: target }, data: { authorId: u.id } }),
    prisma.issue.updateMany({ where: { openedById: target }, data: { openedById: u.id } }),
    prisma.user.delete({ where: { id: target } }),
  ]);
  await logAudit(u.id, "User", target, "DELETE", { email: usr.email, role: usr.role });
  refresh();
}

// --- Journal d'audit : individuelle, par critères, totale
export async function deleteAuditEntry(fd: FormData) {
  await admin();
  await prisma.auditLog.deleteMany({ where: { id: id(fd) } });
  refresh();
}

export async function deleteAuditByFilter(fd: FormData) {
  const u = await admin();
  const f = Object.fromEntries(fd) as Record<string, string | undefined>;
  const criteres = Object.fromEntries(["entity", "action", "userId", "from", "to"].filter((k) => f[k]).map((k) => [k, f[k]]));
  if (!Object.keys(criteres).length) throw new Error("Choisissez au moins un critère de filtre.");
  need(fd, "SUPPRIMER");
  const r = await prisma.auditLog.deleteMany({ where: auditWhere(f) });
  await logAudit(u.id, "AuditLog", "*", "PURGE", undefined, { criteres, supprimees: r.count }); // trace de la purge
  refresh();
}

export async function deleteAllAudit(fd: FormData) {
  const u = await admin();
  need(fd, "SUPPRIMER TOUT");
  const r = await prisma.auditLog.deleteMany({});
  await logAudit(u.id, "AuditLog", "*", "PURGE_TOTALE", undefined, { supprimees: r.count });
  refresh();
}





// --- Modules rapports de terrain (admin uniquement)
export async function deleteDailyReport(fd: FormData) {
  const u = await admin();
  const r = await prisma.dailyReport.findUnique({ where: { id: id(fd) } });
  if (!r) redirect("/rapport-jour");
  await prisma.dailyReport.delete({ where: { id: r.id } });
  await logAudit(u.id, "DailyReport", r.id, "DELETE", { date: r.date, site: r.site });
  refresh();
  redirect("/rapport-jour");
}

export async function deleteNc(fd: FormData) {
  const u = await admin();
  const n = await prisma.nonConformity.findUnique({ where: { id: id(fd) } });
  if (!n) return;
  await prisma.nonConformity.delete({ where: { id: n.id } });
  await logAudit(u.id, "NonConformity", n.id, "DELETE", { number: n.number, description: n.description });
  refresh();
}

export async function deleteMaterial(fd: FormData) {
  const u = await admin();
  const m = await prisma.materialRequest.findUnique({ where: { id: id(fd) } });
  if (!m) redirect("/materiel");
  await prisma.materialRequest.delete({ where: { id: m.id } });
  await logAudit(u.id, "MaterialRequest", m.id, "DELETE", { number: m.number });
  refresh();
  redirect("/materiel"); // retour à la liste après suppression
}

export async function deletePeriod(fd: FormData) {
  const u = await admin();
  const p = await prisma.periodLog.findUnique({ where: { id: id(fd) } });
  if (!p) return;
  await prisma.periodLog.delete({ where: { id: p.id } });
  await logAudit(u.id, "PeriodLog", p.id, "DELETE", { du: p.startDate, au: p.endDate, work: p.work });
  refresh();
}

export async function deleteChecklistPoint(fd: FormData) {
  const u = await admin();
  const p = await prisma.checklistPoint.findUnique({ where: { id: id(fd) } });
  if (!p) return;
  await prisma.checklistPoint.delete({ where: { id: p.id } }); // résultats supprimés en cascade
  await logAudit(u.id, "ChecklistPoint", p.id, "DELETE", { system: p.system, label: p.label });
  refresh();
}

export async function deleteTimesheetWeek(fd: FormData) {
  const u = await admin();
  const p = await currentProject();
  const week = parseDay(String(fd.get("week") ?? ""));
  if (!week) return;
  const site = String(fd.get("site") ?? "");
  const r = await prisma.timesheetEntry.deleteMany({ where: { projectId: p.id, weekStart: week, site } });
  await logAudit(u.id, "Timesheet", p.id, "DELETE_WEEK", undefined, { semaine: week, site, lignes: r.count });
  refresh();
}

export async function deleteProgressSnapshot(fd: FormData) {
  const u = await admin();
  const p = await currentProject();
  const date = parseDay(String(fd.get("date") ?? ""));
  if (!date) return;
  const r = await prisma.postProgress.deleteMany({ where: { projectId: p.id, date } });
  await logAudit(u.id, "PostProgress", p.id, "DELETE_SNAPSHOT", undefined, { date, lignes: r.count });
  refresh();
}








export async function deleteRef(fd: FormData) {
  const u = await admin();
  const r = await prisma.refItem.findUnique({ where: { id: id(fd) } });
  if (!r) return;
  const ops = [prisma.refItem.delete({ where: { id: r.id } })] as Prisma.PrismaPromise<unknown>[];
  if (r.kind === "POST") ops.push(prisma.postProgress.deleteMany({ where: { projectId: r.projectId, post: r.key } }));
  if (r.kind === "BUILDING") ops.push(prisma.postProgress.deleteMany({ where: { projectId: r.projectId, building: r.key } }));
  await prisma.$transaction(ops);
  await logAudit(u.id, "RefItem", r.id, "DELETE", { kind: r.kind, label: r.label });
  refresh();
}

export async function deleteAttachment(fd: FormData) {
  const u = await admin();
  const a = await prisma.attachment.findUnique({ where: { id: id(fd) } });
  if (!a) return;
  await prisma.attachment.delete({ where: { id: a.id } });
  await unlink(path.join(process.cwd(), "storage", a.id)).catch(() => {});
  await logAudit(u.id, "Attachment", a.id, "DELETE", { filename: a.filename, entity: a.entity });
  refresh();
}