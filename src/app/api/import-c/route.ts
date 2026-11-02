import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";
import { POSTES, buildingOf, parseDay, resolveSystemName, utcDay, excelDate } from "@/lib/domain/rapport";
import { parseExtra, commitExtra } from "@/lib/import-c-extra";
import { getRef } from "@/lib/reference";

export const runtime = "nodejs";
export const maxDuration = 60;

const norm = (s: string) => s.replace(/[–—]/g, "-").trim().toLowerCase();
const EXAMPLE = /exemple/i;

function raw(v: any): any {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return raw(v.result);
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    return null;
  }
  return v;
}
const str = (v: any) => { const x = raw(v); return x instanceof Date ? "" : String(x ?? "").trim(); };
const opt = (v: any) => str(v) || null;
const dateOf = (v: any): Date | null | "ERR" => excelDate(raw(v));
function percent(v: any): number | null | "ERR" { // fraction (0,95) ou pourcentage (95)
  const x = raw(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", ".").replace("%", ""));
  if (Number.isNaN(n) || n < 0 || n > 100) return "ERR";
  return n <= 1 ? n * 100 : n;
}
function qty(v: any): number | null | "ERR" {
  const x = raw(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isNaN(n) || n < 0 ? "ERR" : n;
}

const STATUS_PCT: Record<string, number> = { "à faire": 0, "en cours": 50, "terminé": 100 };

export async function POST(req: Request) {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id || !["ADMIN", "CONDUCTEUR"].includes(u.role)) return Response.json({ error: "Accès refusé" }, { status: 403 });
  const form = await req.formData();
  const file = form.get("file");
  const commit = form.get("mode") === "commit";
  if (!(file instanceof File)) return Response.json({ error: "Fichier manquant" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: "Fichier trop volumineux (10 Mo max)" }, { status: 400 });
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as any); } catch { return Response.json({ error: "Fichier .xlsx illisible" }, { status: 400 }); }
  const sheets = ["Suivi des tâches", "État d'avancement", "Avancement par bâtiment", "Non-conformités", "Demande matériel", "Historique par période", "Rapport journalier", "Pointage", "Autocontrôle"];
  if (!sheets.some((n) => wb.getWorksheet(n))) return Response.json({ error: "Aucune feuille reconnue (classeur « Rapport chantier courant faible » attendu)." }, { status: 400 });

  const errors: { line: number; msg: string }[] = [];
  let skipped = 0;

  // --- Suivi des tâches
  type T = { title: string; zoneLabel: string; system: string; pct: number; responsible: string | null; note: string | null; date: Date | null };
  const tasks: T[] = [];
  wb.getWorksheet("Suivi des tâches")?.eachRow((r, n) => {
    if (n < 9) return;
    const title = str(r.getCell(2).value);
    if (!title) return;
    const st = norm(str(r.getCell(5).value));
    const d = dateOf(r.getCell(6).value);
    if (!(st in STATUS_PCT)) return void errors.push({ line: n, msg: `Suivi des tâches : statut inconnu « ${str(r.getCell(5).value)} »` });
    if (d === "ERR") return void errors.push({ line: n, msg: "Suivi des tâches : date invalide" });
    tasks.push({ title, zoneLabel: str(r.getCell(3).value), system: str(r.getCell(4).value), pct: STATUS_PCT[st], responsible: opt(r.getCell(7).value), note: opt(r.getCell(8).value), date: d });
  });

  // --- État d'avancement global et matrice par bâtiment
  const prog: { building: string; post: string; system: string; percent: number; note: string | null }[] = [];
  let progDate: Date | null = null;
  const wsE = wb.getWorksheet("État d'avancement");
  if (wsE) {
    const d = dateOf(wsE.getCell("B3").value);
    progDate = d && d !== "ERR" ? d : null;
    for (let n = 6; n <= 30; n++) {
      const label = norm(str(wsE.getCell(n, 1).value));
      const po = POSTES.find((p) => norm(p.label) === label);
      if (!po) continue;
      const v = percent(wsE.getCell(n, 3).value);
      if (v === "ERR") errors.push({ line: n, msg: "État d'avancement : pourcentage invalide" });
      else if (v != null) prog.push({ building: "", post: po.key, system: po.system, percent: v, note: opt(wsE.getCell(n, 5).value) });
    }
  }
  const wsB = wb.getWorksheet("Avancement par bâtiment");
  if (wsB) {
    const cols = POSTES.map((p) => ({ p, c: [...Array(8).keys()].map((i) => i + 2).find((c) => norm(str(wsB.getCell(3, c).value)) === norm(p.short)) }));
    for (let n = 4; n <= 40; n++) {
      const b = str(wsB.getCell(n, 1).value);
      if (!b || norm(b).startsWith("moyenne") || norm(b).startsWith("légende")) continue;
      for (const { p, c } of cols) {
        if (!c) continue;
        const v = percent(wsB.getCell(n, c).value);
        if (v === "ERR") errors.push({ line: n, msg: `Avancement par bâtiment : pourcentage invalide (${b})` });
        else if (v != null) prog.push({ building: b, post: p.key, system: p.system, percent: v, note: null });
      }
    }
  }

  // --- Non-conformités
  type N = { date: Date; zone: string | null; system: string | null; description: string; action: string | null; responsible: string | null; status: "OUVERT" | "EN_COURS" | "LEVE" };
  const ncs: N[] = [];
  wb.getWorksheet("Non-conformités")?.eachRow((r, n) => {
    if (n < 4) return;
    const description = str(r.getCell(5).value);
    if (!description) return;
    if (EXAMPLE.test(description)) { skipped++; return; }
    const d = dateOf(r.getCell(2).value);
    const st = ({ "ouvert": "OUVERT", "en cours": "EN_COURS", "levé": "LEVE" } as const)[norm(str(r.getCell(8).value)) as "ouvert"] ?? "OUVERT";
    if (d === "ERR") return void errors.push({ line: n, msg: "Non-conformités : date invalide" });
    ncs.push({ date: d ?? utcDay(), zone: opt(r.getCell(3).value), system: opt(r.getCell(4).value), description, action: opt(r.getCell(6).value), responsible: opt(r.getCell(7).value), status: st });
  });

  // --- Demande matériel
  type L = { designation: string; reference: string | null; unit: string | null; quantity: number | null; wanted: Date | null; system: string | null; note: string | null };
  const lines: L[] = [];
  let matDate = utcDay(), matSite: string | null = null;
  const wsM = wb.getWorksheet("Demande matériel");
  if (wsM) {
    const d = dateOf(wsM.getCell("B2").value);
    if (d && d !== "ERR") matDate = d;
    const site = str(wsM.getCell("E2").value);
    matSite = site && !EXAMPLE.test(site) ? site : null;
    for (let n = 5; n <= 60; n++) {
      const designation = str(wsM.getCell(n, 2).value);
      if (!designation) continue;
      if (EXAMPLE.test(designation)) { skipped++; continue; }
      const q = qty(wsM.getCell(n, 5).value), w = dateOf(wsM.getCell(n, 6).value);
      if (q === "ERR" || w === "ERR") { errors.push({ line: n, msg: "Demande matériel : quantité ou date invalide" }); continue; }
      lines.push({ designation, reference: opt(wsM.getCell(n, 3).value), unit: opt(wsM.getCell(n, 4).value), quantity: q, wanted: w, system: opt(wsM.getCell(n, 7).value), note: opt(wsM.getCell(n, 8).value) });
    }
  }

  // --- Historique par période
  type P = { start: Date; end: Date; type: string; zone: string | null; system: string | null; work: string; percent: number | null; note: string | null };
  const periods: P[] = [];
  wb.getWorksheet("Historique par période")?.eachRow((r, n) => {
    if (n < 4) return;
    const work = str(r.getCell(7).value);
    const a = dateOf(r.getCell(1).value), b = dateOf(r.getCell(2).value);
    if (!work && !a) return;
    if (EXAMPLE.test(work) || EXAMPLE.test(str(r.getCell(5).value))) { skipped++; return; }
    const pc = percent(r.getCell(8).value);
    if (a === "ERR" || b === "ERR" || pc === "ERR") return void errors.push({ line: n, msg: "Historique : date ou avancement invalide" });
    if (!a || !b) return void errors.push({ line: n, msg: "Historique : dates « Du » et « Au » obligatoires" });
    if (b < a) return void errors.push({ line: n, msg: "Historique : « Au » avant « Du »" });
    periods.push({ start: a, end: b, type: str(r.getCell(4).value) || "Autre", zone: opt(r.getCell(5).value), system: opt(r.getCell(6).value), work: work || "(non précisé)", percent: pc, note: opt(r.getCell(9).value) });
  });



 const extra = parseExtra(wb, errors);
  skipped += extra.skipped;


  const project = await currentProject();
  const zonesDb = await prisma.zone.findMany({ where: { projectId: project.id } });
  const zoneNameOf = (label: string) => buildingOf(label) ?? "Non localisé";
  const newZones = [...new Set(tasks.map((t) => zoneNameOf(t.zoneLabel)))].filter((nm) => !zonesDb.some((z) => norm(z.name) === norm(nm) || norm(z.building ?? "") === norm(nm)));
  const summary = [`${tasks.length} tâche(s)`, `${prog.length} valeur(s) d'avancement`, `${ncs.length} non-conformité(s)`, `${lines.length} ligne(s) de matériel`, `${periods.length} période(s)`, ...extra.summary, ...(skipped ? [`${skipped} ligne(s) d'exemple ignorée(s)`] : [])];
  const total = tasks.length + prog.length + ncs.length + lines.length + periods.length + extra.count;

  if (!commit) return Response.json({ rows: total, errors, newZones, newLevels: [], newSystems: [], summary });
  if (errors.length) return Response.json({ error: "Corrigez les erreurs avant d'importer." }, { status: 400 });


  await getRef(project.id, "BUILDING"); // garantit que la liste par défaut existe

  await prisma.$transaction(async (tx) => {
    // Tâches : rattachées à un bâtiment (zone) par mot-clé ; le texte d'origine reste dans « Localisation »
    const systems = await tx.system.findMany({ where: { projectId: project.id, lot: "CFA" } });
    const zones = await tx.zone.findMany({ where: { projectId: project.id } });
    let zn = zones.reduce((m, z) => Math.max(m, Number(z.code.replace(/\D/g, "")) || 0), 0);
    let order = zones.reduce((m, z) => Math.max(m, z.order), 0);
    const codes = await tx.workItem.findMany({ where: { projectId: project.id, kind: "TASK" }, select: { code: true } });
    let seq = codes.reduce((m, r) => Math.max(m, Number(r.code?.slice(1)) || 0), 0);
    for (const t of tasks) {
      const name = zoneNameOf(t.zoneLabel);
      let zone = zones.find((z) => norm(z.name) === norm(name) || norm(z.building ?? "") === norm(name));
      if (!zone) {
        zone = await tx.zone.create({ data: { projectId: project.id, code: `Z${String(++zn).padStart(2, "0")}`, name, building: name, order: ++order, mainLot: "CFA" } });
        zones.push(zone);
      }
      const sysName = resolveSystemName(t.system);
      const systemId = sysName ? systems.find((x) => norm(x.name) === norm(sysName))?.id ?? null : null;
      const note = [t.note, !systemId && t.system ? `Système : ${t.system}` : null].filter(Boolean).join(" · ") || null;
      const data = { systemId, location: t.zoneLabel || null, responsible: t.responsible, note, manualProgress: t.pct, status: computeStatus({ qtyPlanned: null, qtyDone: null, manualProgress: t.pct }), lastUpdatedAt: t.date ?? new Date(), lastUpdatedById: u.id as string, deletedAt: null };
      const ex = await tx.workItem.findFirst({ where: { projectId: project.id, kind: "TASK", zoneId: zone.id, title: t.title } });
      if (ex) await tx.workItem.update({ where: { id: ex.id }, data });
      else await tx.workItem.create({ data: { ...data, projectId: project.id, kind: "TASK", code: `T${String(++seq).padStart(3, "0")}`, zoneId: zone.id, lot: "CFA", title: t.title, unit: "u" } });
    }

    // Avancement : l'état de la date importée est remplacé
    if (prog.length) {
      const date = progDate ?? utcDay();
      await tx.postProgress.deleteMany({ where: { projectId: project.id, date } });
      await tx.postProgress.createMany({ data: prog.map((r) => ({ ...r, projectId: project.id, date })) });
    }



      for (const b of new Set(prog.filter((r) => r.building).map((r) => r.building))) {
      await tx.refItem.upsert({
        where: { projectId_kind_key: { projectId: project.id, kind: "BUILDING", key: b } },
        update: {},
        create: { projectId: project.id, kind: "BUILDING", key: b, label: b, order: 99 },
        });
      }

    // Non-conformités (ignore celles déjà présentes avec la même description)
    const agg = await tx.nonConformity.aggregate({ where: { projectId: project.id }, _max: { number: true } });
    let nextNc = (agg._max.number ?? 0) + 1;
    for (const c of ncs) {
      if (await tx.nonConformity.findFirst({ where: { projectId: project.id, description: c.description } })) continue;
      await tx.nonConformity.create({ data: { projectId: project.id, number: nextNc++, date: c.date, zoneLabel: c.zone, system: c.system, description: c.description, action: c.action, responsible: c.responsible, status: c.status, closedAt: c.status === "LEVE" ? new Date() : null } });
    }

    // Demande de matériel : une demande par import
    if (lines.length && !(await tx.materialRequest.findFirst({ where: { projectId: project.id, date: matDate, lines: { some: { designation: lines[0].designation } } } }))) {
      const a = await tx.materialRequest.aggregate({ where: { projectId: project.id }, _max: { number: true } });
      await tx.materialRequest.create({
        data: { projectId: project.id, number: (a._max.number ?? 0) + 1, date: matDate, site: matSite, createdBy: "Import Excel", lines: { create: lines.map((l, position) => ({ position, designation: l.designation, reference: l.reference, unit: l.unit, quantity: l.quantity, wantedDate: l.wanted, system: l.system, note: l.note })) } },
      });
    }

    // Historique
    for (const p of periods) {
      if (await tx.periodLog.findFirst({ where: { projectId: project.id, startDate: p.start, endDate: p.end, workType: p.type, work: p.work } })) continue;
      await tx.periodLog.create({ data: { projectId: project.id, startDate: p.start, endDate: p.end, workType: p.type, zoneLabel: p.zone, system: p.system, work: p.work, percent: p.percent, note: p.note } });
    }
      await commitExtra(tx, project.id, extra);

  }, { timeout: 60000, maxWait: 10000 });


  await logAudit(u.id, "Project", project.id, "IMPORT_C", undefined, { tasks: tasks.length, avancement: prog.length, nc: ncs.length, materiel: lines.length, periodes: periods.length });
  ["/dashboard", "/taches", "/zones", "/avancement", "/non-conformites", "/materiel", "/historique"].forEach((p) => revalidatePath(p));
  return Response.json({ imported: total });
}