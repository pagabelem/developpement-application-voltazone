"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isManager } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { refreshAll } from "@/lib/revalidate";
import { CHECKLIST_DEFAULT,  isoDay, mondayOf, numOrNull, parseDay, utcDay } from "@/lib/domain/rapport";
import { getRef, slug } from "@/lib/reference";
async function writer() {
  const u = await requireUser();
  if (!canWrite(u)) throw new Error("Accès refusé");
  return u;
}
async function manager() {
  const u = await requireUser();
  if (!isManager(u)) throw new Error("Accès refusé");
  return u;
}
const txt = (fd: FormData, k: string) => { const v = String(fd.get(k) ?? "").trim(); return v || null; };
function pct(fd: FormData, k: string) {
  const n = numOrNull(fd.get(k));
  if (n == null) return null;
  if (n < 0 || n > 100) throw new Error("Un pourcentage doit être compris entre 0 et 100.");
  return n;
}



function rowsOf(fd: FormData, prefix: string, keys: string[]) {
  const n = Math.min(1000, Number(fd.get(`${prefix}_n`)) || 0);
  return Array.from({ length: n }, (_, i) => Object.fromEntries(keys.map((k) => [k, fd.get(`${prefix}_${k}_${i}`)])) as Record<string, FormDataEntryValue | null>);
}
const sv = (v: FormDataEntryValue | null | undefined) => { const t = String(v ?? "").trim(); return t || null; };
function pctv(v: FormDataEntryValue | null | undefined) {
  const n = numOrNull(v);
  if (n == null) return null;
  if (n < 0 || n > 100) throw new Error("Un pourcentage doit être compris entre 0 et 100.");
  return n;
}
function hrs(v: FormDataEntryValue | null | undefined) {
  const n = numOrNull(v);
  if (n != null && (n < 0 || n > 24)) throw new Error("Heures par jour : entre 0 et 24.");
  return n;
}




async function nextNc(projectId: string) {
  const a = await prisma.nonConformity.aggregate({ where: { projectId }, _max: { number: true } });
  return (a._max.number ?? 0) + 1;
}
async function nextMat(projectId: string) {
  const a = await prisma.materialRequest.aggregate({ where: { projectId }, _max: { number: true } });
  return (a._max.number ?? 0) + 1;
}

// ---------- Rapport journalier
export async function saveDailyReport(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const date = parseDay(txt(fd, "date")), site = txt(fd, "site");
  if (!date || !site) throw new Error("La date et le chantier sont obligatoires.");
  const id = txt(fd, "id");
  const existing = id
    ? await prisma.dailyReport.findUnique({ where: { id } })
    : await prisma.dailyReport.findUnique({ where: { projectId_date_site: { projectId: p.id, date, site } } });
  if (existing?.managerVisaAt && !isManager(user)) throw new Error("Rapport visé par le conducteur : modification réservée aux responsables.");

  const workers = rowsOf(fd, "w", ["name", "role", "hours", "note"])
    .map((r) => ({ name: sv(r.name), role: sv(r.role), hours: hrs(r.hours), note: sv(r.note) }))
    .filter((w) => w.name) as { name: string; role: string | null; hours: number | null; note: string | null }[];
  const systems = rowsOf(fd, "s", ["system", "previousPct", "todayPct", "work"])
    .map((r) => ({ system: sv(r.system), previousPct: pctv(r.previousPct) ?? 0, todayPct: pctv(r.todayPct) ?? 0, work: sv(r.work) }))
    .filter((s) => s.system) as { system: string; previousPct: number; todayPct: number; work: string | null }[];

  const data = { date, site, zoneLabel: txt(fd, "zoneLabel"), leaderName: txt(fd, "leaderName"), weather: txt(fd, "weather"), issuesText: txt(fd, "issuesText"), materialText: txt(fd, "materialText"), safetyText: txt(fd, "safetyText"), tomorrowText: txt(fd, "tomorrowText") };

  const report = await prisma.$transaction(async (tx) => {
    const r = existing ? await tx.dailyReport.update({ where: { id: existing.id }, data }) : await tx.dailyReport.create({ data: { ...data, projectId: p.id, createdById: user.id } });
    await tx.dailyReportWorker.deleteMany({ where: { reportId: r.id } });
    await tx.dailyReportSystem.deleteMany({ where: { reportId: r.id } });
    await tx.dailyReportWorker.createMany({ data: workers.map((w) => ({ ...w, reportId: r.id })) });
    await tx.dailyReportSystem.createMany({ data: systems.map((s) => ({ ...s, reportId: r.id })) });
    return r;
  });
  await logAudit(user.id, "DailyReport", report.id, existing ? "UPDATE" : "CREATE", undefined, { date: isoDay(date), site, workers: workers.length, systems: systems.length });
  refreshAll();
  redirect(`/rapport-jour?id=${report.id}`);
}

export async function signReport(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("id"));
  const who = fd.get("who") === "manager" ? "manager" : "leader";
  if (who === "manager" ? !isManager(user) : !canWrite(user)) throw new Error("Accès refusé");
  const now = new Date();
  await prisma.dailyReport.update({ where: { id }, data: who === "manager" ? { managerVisaBy: user.name, managerVisaAt: now } : { leaderVisaBy: user.name, leaderVisaAt: now } });
  await logAudit(user.id, "DailyReport", id, `VISA_${who.toUpperCase()}`);
  refreshAll();
}

// ---------- Avancement par poste (global + bâtiments) pour une date
export async function saveProgress(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const date = parseDay(txt(fd, "date"));
  if (!date) throw new Error("Date invalide.");
  const posts = await getRef(p.id, "POST");
  const buildings = fd.getAll("building").map(String);
  const rows: { building: string; post: string; system: string | null; percent: number; note: string | null }[] = [];
  for (const po of posts) {
    const g = pct(fd, `g_${po.key}`);
    if (g != null) rows.push({ building: "", post: po.key, system: po.system, percent: g, note: txt(fd, `gn_${po.key}`) });
    buildings.forEach((b, bi) => {
      const m = pct(fd, `m_${bi}_${po.key}`);
      if (m != null) rows.push({ building: b, post: po.key, system: po.system, percent: m, note: null });
    });
  }
  await prisma.$transaction([
    prisma.postProgress.deleteMany({ where: { projectId: p.id, date } }),
    prisma.postProgress.createMany({ data: rows.map((r) => ({ ...r, projectId: p.id, date })) }),
  ]);
  await logAudit(user.id, "PostProgress", p.id, "SAVE", undefined, { date: isoDay(date), lignes: rows.length });
  refreshAll();
  redirect(`/avancement?date=${isoDay(date)}`);
}

// ---------- Pointage hebdomadaire
export async function saveTimesheet(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const week = mondayOf(parseDay(txt(fd, "week")) ?? new Date());
  const site = txt(fd, "site") ?? "";
    const rows = rowsOf(fd, "t", ["name", "role", "h1", "h2", "h3", "h4", "h5", "h6", "note"])
    .map((r) => ({ name: sv(r.name), role: sv(r.role), h1: hrs(r.h1), h2: hrs(r.h2), h3: hrs(r.h3), h4: hrs(r.h4), h5: hrs(r.h5), h6: hrs(r.h6), note: sv(r.note) }))
    .filter((r) => r.name) as { name: string; role: string | null; h1: number | null; h2: number | null; h3: number | null; h4: number | null; h5: number | null; h6: number | null; note: string | null }[];
    
  await prisma.$transaction([
    prisma.timesheetEntry.deleteMany({ where: { projectId: p.id, weekStart: week, site } }),
    prisma.timesheetEntry.createMany({ data: rows.map((r) => ({ ...r, projectId: p.id, weekStart: week, site })) }),
  ]);
  await logAudit(user.id, "Timesheet", p.id, "SAVE", undefined, { semaine: isoDay(week), site, lignes: rows.length });
  refreshAll();
  redirect(`/pointage?week=${isoDay(week)}&site=${encodeURIComponent(site)}`);
}

// Pré-remplit la semaine depuis l'effectif des rapports journaliers (lundi à samedi)
export async function prefillTimesheet(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const week = mondayOf(parseDay(txt(fd, "week")) ?? new Date());
  const site = txt(fd, "site") ?? "";
  const end = new Date(week);
  end.setUTCDate(end.getUTCDate() + 6);
  const reports = await prisma.dailyReport.findMany({ where: { projectId: p.id, date: { gte: week, lte: end }, ...(site ? { site } : {}) }, include: { workers: true } });
  const byName = new Map<string, { role: string | null; h: (number | null)[] }>();
  for (const r of reports) {
    const d = Math.round((r.date.getTime() - week.getTime()) / 86400000);
    if (d < 0 || d > 5) continue;
    for (const w of r.workers) {
      const e = byName.get(w.name) ?? { role: w.role, h: [null, null, null, null, null, null] };
      e.h[d] = (e.h[d] ?? 0) + (w.hours ?? 0);
      byName.set(w.name, e);
    }
  }
  const have = new Set((await prisma.timesheetEntry.findMany({ where: { projectId: p.id, weekStart: week, site }, select: { name: true } })).map((e) => e.name));
  const data = [...byName].filter(([n]) => !have.has(n)).map(([name, e]) => ({ projectId: p.id, weekStart: week, site, name, role: e.role, h1: e.h[0], h2: e.h[1], h3: e.h[2], h4: e.h[3], h5: e.h[4], h6: e.h[5] }));
  if (data.length) await prisma.timesheetEntry.createMany({ data });
  await logAudit(user.id, "Timesheet", p.id, "PREFILL", undefined, { semaine: isoDay(week), site, ajoutes: data.length });
  refreshAll();
  redirect(`/pointage?week=${isoDay(week)}&site=${encodeURIComponent(site)}`);
}

// ---------- Autocontrôle
export async function loadChecklistPoints() {
  const u = await manager();
  const p = await currentProject();
  if ((await prisma.checklistPoint.count({ where: { projectId: p.id } })) > 0) return;
  await prisma.checklistPoint.createMany({ data: CHECKLIST_DEFAULT.map(([system, label], i) => ({ projectId: p.id, system, label, order: i + 1 })) });
  await logAudit(u.id, "ChecklistPoint", p.id, "LOAD_DEFAULT", undefined, { points: CHECKLIST_DEFAULT.length });
  refreshAll();
}

export async function addChecklistPoint(fd: FormData) {
  const u = await manager();
  const p = await currentProject();
  const system = txt(fd, "system"), label = txt(fd, "label");
  if (!system || !label) throw new Error("Système et point de contrôle obligatoires.");
  const max = await prisma.checklistPoint.aggregate({ where: { projectId: p.id }, _max: { order: true } });
  const pt = await prisma.checklistPoint.create({ data: { projectId: p.id, system, label, order: (max._max.order ?? 0) + 1 } });
  await logAudit(u.id, "ChecklistPoint", pt.id, "CREATE", undefined, { system, label });
  refreshAll();
}

export async function saveChecklist(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const scope = txt(fd, "scope") ?? "";
  const points = await prisma.checklistPoint.findMany({ where: { projectId: p.id } });
  const today = utcDay();
  let nc = 0;
  for (const pt of points) {
    const r = String(fd.get(`r_${pt.id}`) ?? "");
    if (r !== "CONFORME" && r !== "NON_CONFORME") {
      await prisma.checklistResult.deleteMany({ where: { pointId: pt.id, scope } });
      continue;
    }
    const date = parseDay(txt(fd, `d_${pt.id}`)) ?? today, note = txt(fd, `o_${pt.id}`);
    await prisma.checklistResult.upsert({
      where: { pointId_scope: { pointId: pt.id, scope } },
      update: { result: r, date, note, byName: user.name },
      create: { pointId: pt.id, scope, result: r, date, note, byName: user.name },
    });
    if (r === "NON_CONFORME") { // une réserve est ouverte automatiquement (une seule fois par point et par périmètre)
      const source = `AUTOCONTROLE:${pt.id}:${scope}`;
      if (!(await prisma.nonConformity.findFirst({ where: { projectId: p.id, source } }))) {
        await prisma.nonConformity.create({ data: { projectId: p.id, number: await nextNc(p.id), date, zoneLabel: scope || null, system: pt.system, description: `${pt.system} — ${pt.label}`, action: note, source } });
        nc++;
      }
    }
  }
  await logAudit(user.id, "Checklist", p.id, "SAVE", undefined, { scope, reservesCreees: nc });
  refreshAll();
  redirect(`/autocontrole?scope=${encodeURIComponent(scope)}`);
}

// ---------- Non-conformités / réserves
export async function saveNc(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const d = z.object({
    id: z.string().optional(), date: z.string().optional(), zoneLabel: z.string().optional(), system: z.string().optional(),
    description: z.string().optional(), action: z.string().optional(), responsible: z.string().optional(),
    status: z.enum(["OUVERT", "EN_COURS", "LEVE"]).default("OUVERT"),
  }).parse(Object.fromEntries(fd));
  const fields = { date: parseDay(d.date) ?? utcDay(), zoneLabel: d.zoneLabel || null, system: d.system || null, action: d.action || null, responsible: d.responsible || null };
  if (d.id) {
    const nc = await prisma.nonConformity.findUniqueOrThrow({ where: { id: d.id } });
    await prisma.nonConformity.update({ where: { id: nc.id }, data: { ...fields, description: d.description?.trim() || nc.description, status: d.status, closedAt: d.status === "LEVE" ? nc.closedAt ?? new Date() : null } });
    await logAudit(user.id, "NonConformity", nc.id, "UPDATE", { status: nc.status }, { status: d.status });
  } else {
    if (!d.description?.trim()) throw new Error("La description est obligatoire.");
    const nc = await prisma.nonConformity.create({ data: { ...fields, projectId: p.id, number: await nextNc(p.id), description: d.description.trim(), status: d.status, closedAt: d.status === "LEVE" ? new Date() : null } });
    await logAudit(user.id, "NonConformity", nc.id, "CREATE", undefined, { number: nc.number });
  }
  refreshAll();
}

// ---------- Demande de matériel
export async function saveMaterial(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const id = txt(fd, "id");
  const date = parseDay(txt(fd, "date")) ?? utcDay();
  const status = z.enum(["BROUILLON", "ENVOYEE", "RECUE"]).parse(fd.get("status") ?? "BROUILLON");
   const lines = rowsOf(fd, "m", ["designation", "reference", "unit", "quantity", "wantedDate", "system", "note"])
    .map((r) => ({ designation: sv(r.designation), reference: sv(r.reference), unit: sv(r.unit), quantity: numOrNull(r.quantity), wantedDate: parseDay(sv(r.wantedDate)), system: sv(r.system), note: sv(r.note) }))
    .filter((l) => l.designation)
    .map((l, position) => ({ ...l, designation: l.designation as string, position }));

  const req = await prisma.$transaction(async (tx) => {
    const r = id
      ? await tx.materialRequest.update({ where: { id }, data: { date, site: txt(fd, "site"), status } })
      : await tx.materialRequest.create({ data: { projectId: p.id, number: await nextMat(p.id), date, site: txt(fd, "site"), status, createdBy: user.name } });
    await tx.materialLine.deleteMany({ where: { requestId: r.id } });
    await tx.materialLine.createMany({ data: lines.map((l) => ({ ...l, requestId: r.id })) });
    return r;
  });
  await logAudit(user.id, "MaterialRequest", req.id, id ? "UPDATE" : "CREATE", undefined, { number: req.number, lignes: lines.length, status });
  refreshAll();
  redirect(`/materiel/${req.id}`);
}

// ---------- Historique par période
export async function savePeriod(fd: FormData) {
  const user = await writer();
  const p = await currentProject();
  const start = parseDay(txt(fd, "start")), end = parseDay(txt(fd, "end"));
  const workType = txt(fd, "workType"), work = txt(fd, "work");
  if (!start || !end || !workType || !work) throw new Error("Dates, type de travaux et travaux réalisés sont obligatoires.");
  if (end < start) throw new Error("La date de fin doit être postérieure au début.");
  const data = { startDate: start, endDate: end, workType, zoneLabel: txt(fd, "zoneLabel"), system: txt(fd, "system"), work, percent: pct(fd, "percent"), note: txt(fd, "note") };
  const id = txt(fd, "id");
  const row = id ? await prisma.periodLog.update({ where: { id }, data }) : await prisma.periodLog.create({ data: { ...data, projectId: p.id } });
  await logAudit(user.id, "PeriodLog", row.id, id ? "UPDATE" : "CREATE", undefined, { du: isoDay(start), au: isoDay(end), workType });
  refreshAll();
  redirect("/historique");
}

// ---------- Identité du chantier et seuil d'heures supplémentaires
export async function saveProject(fd: FormData) {
  const u = await manager();
  const p = await currentProject();
  const d = z.object({ name: z.string().min(1), client: z.string().optional(), company: z.string().optional(), overtimeAfter: z.coerce.number().int().min(1).max(100) }).parse(Object.fromEntries(fd));
  await prisma.project.update({ where: { id: p.id }, data: { name: d.name, client: d.client || null, company: d.company || null, overtimeAfter: d.overtimeAfter } });
  await logAudit(u.id, "Project", p.id, "UPDATE_IDENTITY", undefined, d);
  refreshAll();
}






// Ajout d'un bâtiment, d'un poste, d'un système de rapport ou d'un type de travaux
export async function addRef(fd: FormData) {
  const u = await manager();
  const p = await currentProject();
  const kind = z.enum(["BUILDING", "POST", "REPORT_SYSTEM", "WORK_TYPE"]).parse(fd.get("kind"));
  const label = txt(fd, "label");
  if (!label) throw new Error("Le nom est obligatoire.");
  await getRef(p.id, kind); // garantit que la liste par défaut existe avant d'ajouter
  const key = kind === "POST" ? `P_${slug(label)}` : label;
  if (await prisma.refItem.findUnique({ where: { projectId_kind_key: { projectId: p.id, kind, key } } })) throw new Error("Cet élément existe déjà.");
  const max = await prisma.refItem.aggregate({ where: { projectId: p.id, kind }, _max: { order: true } });
  await prisma.refItem.create({ data: { projectId: p.id, kind, key, label, short: label, system: txt(fd, "system"), order: (max._max.order ?? 0) + 1 } });
  await logAudit(u.id, "RefItem", p.id, "CREATE", undefined, { kind, label });
  refreshAll();
}