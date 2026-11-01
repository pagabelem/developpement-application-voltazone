"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/permissions";
import { auditWhere, buildWhere } from "@/lib/filters";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";

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