"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin, isManager } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { refreshAll } from "@/lib/revalidate";

import { redirect } from "next/navigation";
import { ensureGrid } from "@/lib/grid";


async function mgr() {
  const u = await requireUser();
  if (!isManager(u)) throw new Error("Accès refusé");
  return u;
}

export async function upsertZone(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const num = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).optional());
  const d = z.object({
    id: z.string().optional(), code: z.string().max(10).optional(), name: z.string().min(1).max(120), building: z.string().optional(),
    order: z.coerce.number().int().default(0), mainLot: z.string().optional(), leaderName: z.string().optional(), plannedHeadcount: num, note: z.string().optional(),
  }).parse(Object.fromEntries(fd));

  let code = d.code?.trim().toUpperCase();
  if (!code) {
    // code automatique : numéro le plus élevé (zones archivées comprises) + 1
    const all = await prisma.zone.findMany({ where: { projectId: p.id }, select: { code: true } });
    const max = all.reduce((m, x) => Math.max(m, Number(x.code.replace(/\D/g, "")) || 0), 0);
    code = `Z${String(max + 1).padStart(2, "0")}`;
  }
  const dup = await prisma.zone.findFirst({ where: { projectId: p.id, code, ...(d.id ? { NOT: { id: d.id } } : {}) } });
  if (dup) throw new Error(`Le code ${code} existe déjà${dup.deletedAt ? " (zone archivée)" : ""}. Choisissez un autre code ou laissez le champ vide.`);

  const data = { code, name: d.name, building: d.building || null, order: d.order, mainLot: d.mainLot || "CFO/CFA", leaderName: d.leaderName || null, plannedHeadcount: d.plannedHeadcount ?? null, note: d.note || null };
  const zone = d.id ? await prisma.zone.update({ where: { id: d.id }, data }) : await prisma.zone.create({ data: { ...data, projectId: p.id } });
  const created = d.id ? 0 : await ensureGrid(p.id); // la nouvelle zone apparaît tout de suite dans le Suivi
  await logAudit(u.id, "Zone", zone.id, d.id ? "UPDATE" : "CREATE", undefined, { ...data, gridLinesCreated: created });
  refreshAll();
}

export async function archiveZone(fd: FormData) {
  const u = await mgr();
  const id = String(fd.get("id"));
  await prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.workItem.updateMany({ where: { zoneId: id }, data: { deletedAt: new Date() } });
  await logAudit(u.id, "Zone", id, "ARCHIVE");
  refreshAll();
}

export async function addLevel(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const d = z.object({ label: z.string().min(1).max(40), order: z.coerce.number().int().default(0) }).parse(Object.fromEntries(fd));
  const l = await prisma.level.create({ data: { ...d, projectId: p.id } });
  const created = await ensureGrid(p.id);
  await logAudit(u.id, "Level", l.id, "CREATE", undefined, { ...d, gridLinesCreated: created });
  refreshAll();
}

export async function addSystem(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const d = z.object({ lot: z.enum(["CFO", "CFA"]), name: z.string().min(1).max(60), defaultUnit: z.string().min(1).max(10).default("u"), order: z.coerce.number().int().default(0), gridEnabled: z.string().optional() }).parse(Object.fromEntries(fd));
  const { gridEnabled, ...rest } = d;
  const s = await prisma.system.create({ data: { ...rest, gridEnabled: !!gridEnabled, projectId: p.id } });
  const created = gridEnabled ? await ensureGrid(p.id) : 0;
  await logAudit(u.id, "System", s.id, "CREATE", undefined, { ...d, gridLinesCreated: created });
  refreshAll();
}

// EF-14 : génère les lignes manquantes zone × niveau × système
export async function generateGrid() {
  const u = await mgr();
  const p = await currentProject();
  const created = await ensureGrid(p.id);
  await logAudit(u.id, "Project", p.id, "GENERATE_GRID", undefined, { created });
  refreshAll();
  redirect(`/parametres?grid=${created}`);
}

export async function saveTeam(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const d = z.object({
    id: z.string().optional(), name: z.string().min(1), lot: z.enum(["CFO", "CFA"]), leaderId: z.string().optional(), leaderName: z.string().optional(),
    matricule: z.string().optional(), headcount: z.coerce.number().int().min(0).default(0), phone: z.string().optional(), startDate: z.string().optional(), note: z.string().optional(),
  }).parse(Object.fromEntries(fd));
  const zoneIds = fd.getAll("zoneIds").map(String);
  const data = {
    name: d.name, lot: d.lot, leaderId: d.leaderId || null, leaderName: d.leaderName || null, matricule: d.matricule || null, headcount: d.headcount,
    phone: d.phone || null, startDate: d.startDate ? new Date(`${d.startDate}T00:00:00Z`) : null, note: d.note || null,
  };
  const team = d.id
    ? await prisma.team.update({ where: { id: d.id }, data: { ...data, zones: { set: zoneIds.map((id) => ({ id })) } } })
    : await prisma.team.create({ data: { ...data, projectId: p.id, zones: { connect: zoneIds.map((id) => ({ id })) } } });
  await prisma.workItem.updateMany({ where: { projectId: p.id, lot: d.lot, zoneId: { in: zoneIds }, teamId: null }, data: { teamId: team.id } });
  await logAudit(u.id, "Team", team.id, d.id ? "UPDATE" : "CREATE", undefined, { ...data, zoneIds });
  refreshAll();
}

export async function archiveTeam(fd: FormData) {
  const u = await mgr();
  const id = String(fd.get("id"));
  await prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit(u.id, "Team", id, "ARCHIVE");
  refreshAll();
}

export async function setAggregation(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const aggregation = z.enum(["MOYENNE", "SOMME"]).parse(fd.get("aggregation"));
  await prisma.project.update({ where: { id: p.id }, data: { aggregation } });
  await logAudit(u.id, "Project", p.id, "SET_AGGREGATION", { aggregation: p.aggregation }, { aggregation });
  refreshAll();
}

export async function createUser(fd: FormData) {
  const u = await requireUser();
  if (!isAdmin(u)) throw new Error("Accès refusé");
  const d = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(["ADMIN", "CONDUCTEUR", "CHEF_CFO", "CHEF_CFA", "CLIENT"]) }).parse(Object.fromEntries(fd));
  const lot = d.role === "CHEF_CFO" ? "CFO" : d.role === "CHEF_CFA" ? "CFA" : null;
  const created = await prisma.user.create({ data: { name: d.name, email: d.email.toLowerCase(), role: d.role, lot, passwordHash: await bcrypt.hash(d.password, 10) } });
  await logAudit(u.id, "User", created.id, "CREATE", undefined, { email: created.email, role: created.role });
  refreshAll();
}

export async function toggleUser(fd: FormData) {
  const u = await requireUser();
  if (!isAdmin(u)) throw new Error("Accès refusé");
  const id = String(fd.get("id"));
  if (id === u.id) throw new Error("Vous ne pouvez pas vous désactiver.");
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !target.active } });
  await logAudit(u.id, "User", id, target.active ? "DEACTIVATE" : "ACTIVATE");
  refreshAll();
}