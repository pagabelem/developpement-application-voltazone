import type ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { parseDay, utcDay, excelDate } from "@/lib/domain/rapport";

const EX = /exemple/i;
const norm = (s: string) => s.trim().toLowerCase();
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
function frac(v: any): number | null | "ERR" {
  const x = raw(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", ".").replace("%", ""));
  if (Number.isNaN(n) || n < 0 || n > 100) return "ERR";
  return n <= 1 ? n * 100 : n;
}
function hours(v: any): number | null | "ERR" {
  const x = raw(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isNaN(n) || n < 0 || n > 24 ? "ERR" : n;
}
// Cherche une ligne par le début du texte de la colonne A (robuste si le nombre de lignes varie)
function findRow(ws: ExcelJS.Worksheet, prefix: string, from = 1) {
  for (let r = from; r <= ws.rowCount; r++) if (norm(str(ws.getCell(r, 1).value)).startsWith(norm(prefix))) return r;
  return 0;
}

export type Extra = {
  count: number; skipped: number; summary: string[];
  report: null | { date: Date; site: string; zone: string | null; leader: string | null; weather: string | null; workers: { name: string; role: string | null; hours: number | null; note: string | null }[]; systems: { system: string; prev: number; today: number; work: string | null }[]; issues: string | null; material: string | null; safety: string | null; tomorrow: string | null };
  timesheet: null | { week: Date; site: string; rows: { name: string; role: string | null; h: (number | null)[]; note: string | null }[] };
  checklist: { system: string; label: string; result: "CONFORME" | "NON_CONFORME" | null; date: Date | null; note: string | null }[];
};

export function parseExtra(wb: ExcelJS.Workbook, errors: { line: number; msg: string }[]): Extra {
  const out: Extra = { count: 0, skipped: 0, summary: [], report: null, timesheet: null, checklist: [] };

  // Rapport journalier (ignoré s'il s'agit du chantier d'exemple)
  const w1 = wb.getWorksheet("Rapport journalier");
  if (w1) {
    const site = str(w1.getCell("B4").value);
    const date = dateOf(w1.getCell("B3").value);
    if (!site || EX.test(site)) out.skipped++;
    else if (!date || date === "ERR") errors.push({ line: 3, msg: "Rapport journalier : date invalide" });
    else {
      const wh = findRow(w1, "Effectif total"), sh = findRow(w1, "TRAVAUX RÉALISÉS"), sg = findRow(w1, "Avancement global", sh);
      const workers: NonNullable<Extra["report"]>["workers"] = [];
      for (let r = 11; r < (wh || 19); r++) {
        const name = str(w1.getCell(r, 1).value), h = hours(w1.getCell(r, 3).value);
        if (!name || EX.test(name)) continue;
        if (h === "ERR") { errors.push({ line: r, msg: "Rapport journalier : heures invalides" }); continue; }
        workers.push({ name, role: opt(w1.getCell(r, 2).value), hours: h, note: opt(w1.getCell(r, 5).value) });
      }
      const systems: NonNullable<Extra["report"]>["systems"] = [];
      for (let r = (sh || 21) + 2; r < (sg || 28); r++) {
        const system = str(w1.getCell(r, 1).value), pv = frac(w1.getCell(r, 2).value), pt = frac(w1.getCell(r, 3).value);
        if (!system) continue;
        if (pv === "ERR" || pt === "ERR") { errors.push({ line: r, msg: "Rapport journalier : pourcentage invalide" }); continue; }
        systems.push({ system, prev: pv ?? 0, today: pt ?? 0, work: opt(w1.getCell(r, 5).value) });
      }
      const text = (h: string) => { const r = findRow(w1, h); return r ? opt(w1.getCell(r + 1, 1).value) : null; };
      out.report = { date, site, zone: opt(w1.getCell("B5").value), leader: opt(w1.getCell("B6").value), weather: opt(w1.getCell("B7").value), workers, systems, issues: text("PROBLÈMES"), material: text("MATÉRIEL"), safety: text("POINTS SÉCURITÉ"), tomorrow: text("TRAVAUX PRÉVUS") };
      out.count++;
      out.summary.push(`1 rapport journalier (${site})`);
    }
  }

  // Pointage
  const w4 = wb.getWorksheet("Pointage");
  if (w4) {
    const site = str(w4.getCell("B2").value), week = dateOf(w4.getCell("G2").value);
    const rows: NonNullable<Extra["timesheet"]>["rows"] = [];
    for (let r = 5; r <= w4.rowCount; r++) {
      const name = str(w4.getCell(r, 1).value);
      if (!name || norm(name).startsWith("total")) continue;
      if (EX.test(name)) { out.skipped++; continue; }
      const h = [3, 4, 5, 6, 7, 8].map((c) => hours(w4.getCell(r, c).value));
      if (h.includes("ERR")) { errors.push({ line: r, msg: "Pointage : heures invalides" }); continue; }
      rows.push({ name, role: opt(w4.getCell(r, 2).value), h: h as (number | null)[], note: opt(w4.getCell(r, 11).value) });
    }
    if (rows.length) {
      if (!week || week === "ERR") errors.push({ line: 2, msg: "Pointage : date de semaine invalide" });
      else { out.timesheet = { week, site: EX.test(site) ? "" : site, rows }; out.count += rows.length; out.summary.push(`${rows.length} ligne(s) de pointage`); }
    }
  }

  // Autocontrôle (charge aussi la liste des points)
  const w5 = wb.getWorksheet("Autocontrôle");
  if (w5) {
    for (let r = 4; r <= w5.rowCount; r++) {
      const system = str(w5.getCell(r, 1).value), label = str(w5.getCell(r, 2).value);
      if (!system || !label) continue;
      const ok = str(w5.getCell(r, 3).value).toLowerCase() === "x", ko = str(w5.getCell(r, 4).value).toLowerCase() === "x";
      const d = dateOf(w5.getCell(r, 5).value);
      if (d === "ERR") { errors.push({ line: r, msg: "Autocontrôle : date invalide" }); continue; }
      out.checklist.push({ system, label, result: ok ? "CONFORME" : ko ? "NON_CONFORME" : null, date: d, note: opt(w5.getCell(r, 6).value) });
    }
    if (out.checklist.length) { out.count += out.checklist.length; out.summary.push(`${out.checklist.length} point(s) d'autocontrôle`); }
  }
  return out;
}

export async function commitExtra(tx: Prisma.TransactionClient, projectId: string, x: Extra) {
  if (x.report) {
    const r = x.report;
    const data = { zoneLabel: r.zone, leaderName: r.leader, weather: r.weather, issuesText: r.issues, materialText: r.material, safetyText: r.safety, tomorrowText: r.tomorrow };
    const rep = await tx.dailyReport.upsert({ where: { projectId_date_site: { projectId, date: r.date, site: r.site } }, update: data, create: { ...data, projectId, date: r.date, site: r.site } });
    await tx.dailyReportWorker.deleteMany({ where: { reportId: rep.id } });
    await tx.dailyReportSystem.deleteMany({ where: { reportId: rep.id } });
    await tx.dailyReportWorker.createMany({ data: r.workers.map((w) => ({ ...w, reportId: rep.id })) });
    await tx.dailyReportSystem.createMany({ data: r.systems.map((s) => ({ system: s.system, previousPct: s.prev, todayPct: s.today, work: s.work, reportId: rep.id })) });
  }
  if (x.timesheet) {
    const t = x.timesheet;
    await tx.timesheetEntry.deleteMany({ where: { projectId, weekStart: t.week, site: t.site } });
    await tx.timesheetEntry.createMany({ data: t.rows.map((r) => ({ projectId, weekStart: t.week, site: t.site, name: r.name, role: r.role, h1: r.h[0], h2: r.h[1], h3: r.h[2], h4: r.h[3], h5: r.h[4], h6: r.h[5], note: r.note })) });
  }
  if (x.checklist.length) {
    const pts = await tx.checklistPoint.findMany({ where: { projectId } });
    let order = pts.reduce((m, p) => Math.max(m, p.order), 0);
    for (const c of x.checklist) {
      let pt = pts.find((p) => norm(p.system) === norm(c.system) && norm(p.label) === norm(c.label));
      if (!pt) { pt = await tx.checklistPoint.create({ data: { projectId, system: c.system, label: c.label, order: ++order } }); pts.push(pt); }
      if (c.result) await tx.checklistResult.upsert({ where: { pointId_scope: { pointId: pt.id, scope: "" } }, update: { result: c.result, date: c.date, note: c.note }, create: { pointId: pt.id, scope: "", result: c.result, date: c.date, note: c.note } });
    }
  }
}