import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const norm = (s: string) => s.trim().toLowerCase();
const PLACEHOLDER = /^(exemple|à remplacer|à préciser|optionnel selon)/i;

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
const text = (v: any) => { const s = str(v); return s && !PLACEHOLDER.test(s) ? s : null; }; // ignore les textes d'exemple
function num(v: any): number | null | "ERR" {
  const x = raw(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isNaN(n) || n < 0 ? "ERR" : n;
}
function date(v: any): Date | null | "ERR" {
  const x = raw(v);
  if (x == null || x === "") return null;
  if (x instanceof Date) return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  const s = String(x).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return "ERR";
}
const nn = (v: any) => v as number | null;
const dd = (v: any) => v as Date | null;

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
  const wsT = wb.getWorksheet("Suivi des travaux");
  if (!wsT) return Response.json({ error: "Feuille « Suivi des travaux » introuvable (classeur « Modèle Conducteur Travaux » attendu)." }, { status: 400 });
  const wsZ = wb.getWorksheet("Zones");
  const wsE = wb.getWorksheet("Équipes");
  const errors: { line: number; msg: string }[] = [];

  // --- Feuille Zones
  const zoneRows: { code: string; name: string; building: string | null; mainLot: string; leader: string | null; headcount: number | null; note: string | null }[] = [];
  wsZ?.eachRow((r, n) => {
    if (n === 1) return;
    const code = str(r.getCell(1).value).toUpperCase();
    if (!code) return;
    const hc = num(r.getCell(6).value);
    if (hc === "ERR") return void errors.push({ line: n, msg: "Zones : effectif prévu invalide" });
    zoneRows.push({ code, name: str(r.getCell(2).value) || code, building: text(r.getCell(3).value), mainLot: str(r.getCell(4).value) || "CFO/CFA", leader: text(r.getCell(5).value), headcount: hc == null ? null : Math.round(hc), note: text(r.getCell(10).value) });
  });

  // --- Feuille Équipes
  const teamRows: { lot: "CFO" | "CFA"; name: string; matricule: string | null; zones: string[]; headcount: number; start: Date | null; phone: string | null; note: string | null }[] = [];
  wsE?.eachRow((r, n) => {
    if (n === 1) return;
    const lot = str(r.getCell(1).value).toUpperCase(), name = str(r.getCell(2).value);
    if (!name) return;
    if (lot !== "CFO" && lot !== "CFA") return void errors.push({ line: n, msg: `Équipes : lot invalide « ${lot} »` });
    const hc = num(r.getCell(5).value), start = date(r.getCell(6).value);
    if (hc === "ERR" || start === "ERR") return void errors.push({ line: n, msg: "Équipes : effectif ou date invalide" });
    teamRows.push({ lot, name, matricule: text(r.getCell(3).value), zones: str(r.getCell(4).value).split(/[,;]/).map((x) => x.trim().toUpperCase()).filter(Boolean), headcount: Math.round(hc ?? 0), start, phone: text(r.getCell(7).value), note: text(r.getCell(8).value) });
  });

  // --- Feuille Suivi des travaux
  type T = { line: number; code: string; zone: string; lot: "CFO" | "CFA"; system: string; title: string; location: string | null; responsible: string | null; crew: string | null; hc: number | null; ps: Date | null; pe: Date | null; aStart: Date | null; aEnd: Date | null; status: string; prog: number | null; unit: string; plan: number | null; done: number | null; material: string | null; note: string | null; lu: Date | null };
  const taskRows: T[] = [];
  wsT.eachRow((r, n) => {
    if (n === 1) return;
    const code = str(r.getCell(1).value), zone = str(r.getCell(2).value).toUpperCase(), title = str(r.getCell(5).value);
    if (!code && !zone && !title) return;
    const bad = (m: string) => void errors.push({ line: n, msg: `Suivi des travaux : ${m}` });
    const lot = str(r.getCell(3).value).toUpperCase();
    if (lot !== "CFO" && lot !== "CFA") return bad(`lot invalide « ${lot} »`);
    if (!title) return bad("tâche / activité manquante");
    if (!zone) return bad("zone manquante");
    const hc = num(r.getCell(9).value), plan = num(r.getCell(17).value), done = num(r.getCell(18).value), prog = num(r.getCell(15).value);
    const ps = date(r.getCell(10).value), pe = date(r.getCell(11).value), aStart = date(r.getCell(12).value), aEnd = date(r.getCell(13).value), lu = date(r.getCell(22).value);
    if ([hc, plan, done, prog].includes("ERR")) return bad("effectif, quantité ou avancement invalide");
    if ([ps, pe, aStart, aEnd, lu].includes("ERR")) return bad("date invalide (jj/mm/aaaa attendu)");
    if (typeof prog === "number" && prog > 100) return bad("avancement supérieur à 100 %");
    if (dd(ps) && dd(pe) && dd(pe)! < dd(ps)!) return bad("fin prévue avant le début prévu");
    taskRows.push({ line: n, code, zone, lot, system: str(r.getCell(4).value), title, location: text(r.getCell(6).value), responsible: text(r.getCell(7).value), crew: text(r.getCell(8).value), hc: nn(hc), ps: dd(ps), pe: dd(pe), aStart: dd(aStart), aEnd: dd(aEnd), status: norm(str(r.getCell(14).value)), prog: nn(prog), unit: str(r.getCell(16).value) || "u", plan: nn(plan), done: nn(done), material: text(r.getCell(20).value), note: text(r.getCell(21).value), lu: dd(lu) });
  });

  // --- Contrôles croisés
  const project = await currentProject();
  const [zonesDb, systemsDb] = await Promise.all([
    prisma.zone.findMany({ where: { projectId: project.id } }),
    prisma.system.findMany({ where: { projectId: project.id } }),
  ]);
  const known = new Set([...zonesDb.map((z) => z.code.toUpperCase()), ...zoneRows.map((z) => z.code)]);
  teamRows.forEach((t) => t.zones.filter((c) => !known.has(c)).forEach((c) => errors.push({ line: 0, msg: `Équipes : zone inconnue « ${c} » (${t.name})` })));
  taskRows.filter((t) => !known.has(t.zone)).forEach((t) => errors.push({ line: t.line, msg: `Suivi des travaux : zone inconnue « ${t.zone} »` }));
  const sysKey = (lot: string, name: string) => `${lot}:${norm(name)}`;
  const sysSet = new Set(systemsDb.map((x) => sysKey(x.lot, x.name)));
  const newSystems = [...new Set(taskRows.filter((t) => t.system && !sysSet.has(sysKey(t.lot, t.system))).map((t) => `${t.lot} · ${t.system}`))];
  const newZones = zoneRows.filter((z) => !zonesDb.some((d) => d.code.toUpperCase() === z.code)).map((z) => z.code);
  const summary = [`${zoneRows.length} zone(s)`, `${teamRows.length} équipe(s)`, `${taskRows.length} tâche(s)`];

  if (!commit) return Response.json({ rows: taskRows.length, errors, newZones, newLevels: [], newSystems, summary });
  if (errors.length) return Response.json({ error: "Corrigez les erreurs avant d'importer." }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    // Zones (on ne remplace jamais une valeur existante par du vide)
    let order = zonesDb.reduce((m, z) => Math.max(m, z.order), 0);
    for (const z of zoneRows) {
      const ex = zonesDb.find((d) => d.code.toUpperCase() === z.code);
      const data = { name: z.name, mainLot: z.mainLot, ...(z.building ? { building: z.building } : {}), ...(z.leader ? { leaderName: z.leader } : {}), ...(z.headcount != null ? { plannedHeadcount: z.headcount } : {}), ...(z.note ? { note: z.note } : {}) };
      if (ex) await tx.zone.update({ where: { id: ex.id }, data: { ...data, deletedAt: null } });
      else await tx.zone.create({ data: { ...data, projectId: project.id, code: z.code, order: ++order } });
    }
    const zones = await tx.zone.findMany({ where: { projectId: project.id, deletedAt: null } });
    const zid = new Map(zones.map((z) => [z.code.toUpperCase(), z.id]));

    // Équipes (clé : lot + nom du chef)
    for (const t of teamRows) {
      const ex = await tx.team.findFirst({ where: { projectId: project.id, lot: t.lot, leaderName: t.name, deletedAt: null } });
      const ids = t.zones.map((c) => ({ id: zid.get(c)! }));
      const data = { name: t.name, lot: t.lot, leaderName: t.name, headcount: t.headcount, ...(t.matricule ? { matricule: t.matricule } : {}), ...(t.phone ? { phone: t.phone } : {}), ...(t.start ? { startDate: t.start } : {}), ...(t.note ? { note: t.note } : {}) };
      if (ex) await tx.team.update({ where: { id: ex.id }, data: { ...data, zones: { set: ids } } });
      else await tx.team.create({ data: { ...data, projectId: project.id, zones: { connect: ids } } });
    }
    const teams = await tx.team.findMany({ where: { projectId: project.id, deletedAt: null }, include: { zones: { select: { id: true } } } });

    // Systèmes manquants : réservés aux tâches (hors grille plan/site)
    const sid = new Map(systemsDb.map((x) => [sysKey(x.lot, x.name), x.id]));
    for (const t of taskRows) {
      if (t.system && !sid.has(sysKey(t.lot, t.system))) {
        const x = await tx.system.create({ data: { projectId: project.id, lot: t.lot, name: t.system, defaultUnit: t.unit, gridEnabled: false, order: sid.size + 1 } });
        sid.set(sysKey(t.lot, t.system), x.id);
      }
    }

    // Tâches (clé : code T001…)
    const codes = await tx.workItem.findMany({ where: { projectId: project.id, kind: "TASK" }, select: { code: true } });
    let seq = codes.reduce((m, r) => Math.max(m, Number(r.code?.slice(1)) || 0), 0);
    for (const t of taskRows) {
      const zoneId = zid.get(t.zone)!;
      const team = teams.find((x) => x.lot === t.lot && x.zones.some((z) => z.id === zoneId));
      const blocked = t.status === "bloqué";
      let qtyDone = t.done;
      if (qtyDone == null && (t.plan ?? 0) > 0 && t.prog != null) qtyDone = ((t.plan as number) * t.prog) / 100;
      const code = t.code || `T${String(++seq).padStart(3, "0")}`;
      const data = {
        zoneId, lot: t.lot, systemId: t.system ? sid.get(sysKey(t.lot, t.system)) ?? null : null, title: t.title, location: t.location, responsible: t.responsible, crew: t.crew,
        teamId: team?.id ?? null, plannedHeadcount: t.hc == null ? null : Math.round(t.hc), plannedStart: t.ps, plannedEnd: t.pe, actualStart: t.aStart, actualEnd: t.aEnd,
        status: computeStatus({ qtyPlanned: t.plan, qtyDone, manualProgress: t.prog, blocked }), manualProgress: t.prog, unit: t.unit, qtyPlanned: t.plan, qtyDone,
        material: t.material, note: t.note, lastUpdatedAt: t.lu ?? new Date(), lastUpdatedById: u.id as string, deletedAt: null,
      };
      const ex = await tx.workItem.findFirst({ where: { projectId: project.id, kind: "TASK", code } });
      const item = ex ? await tx.workItem.update({ where: { id: ex.id }, data }) : await tx.workItem.create({ data: { ...data, projectId: project.id, kind: "TASK", code } });
      if (blocked && (await tx.issue.count({ where: { workItemId: item.id, status: "OUVERT" } })) === 0)
        await tx.issue.create({ data: { workItemId: item.id, description: t.note ?? "Bloqué (importé du classeur Excel)", openedById: u.id } });
    }
  }, { timeout: 60000, maxWait: 10000 });

  await logAudit(u.id, "Project", project.id, "IMPORT_A", undefined, { zones: zoneRows.length, teams: teamRows.length, tasks: taskRows.length });
  ["/dashboard", "/taches", "/planning", "/zones", "/equipes", "/blocages"].forEach((p) => revalidatePath(p));
  return Response.json({ imported: taskRows.length });
}