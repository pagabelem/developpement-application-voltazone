import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type Row = { line: number; zone: string; level: string; lot: "CFO" | "CFA"; system: string; plan: number | null; site: number | null; note: string | null };
const norm = (s: string) => s.trim().toLowerCase();
const zoneKey = (s: string) => { const m = norm(s).match(/^zone\s*0*(\d+)$/); return m ? `zone ${m[1]}` : norm(s); };

function cellVal(v: any): string | number | null {
  if (v == null) return null;
  if (typeof v === "object") {
    if (v instanceof Date) return null;
    if ("result" in v) return cellVal(v.result);
    if ("richText" in v) return v.richText.map((t: any) => t.text).join("");
    return null;
  }
  return v;
}
const str = (v: any) => String(cellVal(v) ?? "").trim();
function num(v: any): number | null | "ERR" {
  const x = cellVal(v);
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(String(x).replace(",", "."));
  return Number.isNaN(n) || n < 0 ? "ERR" : n;
}

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
  const ws = wb.getWorksheet("Suivi");
  if (!ws) return Response.json({ error: "Feuille « Suivi » introuvable (classeur « Suivi chantier zones » attendu)." }, { status: 400 });
  if (norm(str(ws.getCell(1, 1).value)) !== "zone" || !norm(str(ws.getCell(1, 4).value)).startsWith("syst"))
    return Response.json({ error: "En-têtes inattendus : colonnes Zone, Étage, Lot, Système, Sur plan, Sur site attendues." }, { status: 400 });

  const rows: Row[] = [];
  const errors: { line: number; msg: string }[] = [];
  ws.eachRow((r, n) => {
    if (n === 1) return;
    const zone = str(r.getCell(1).value);
    if (!zone) return;
    const lot = str(r.getCell(3).value).toUpperCase();
    const plan = num(r.getCell(5).value), site = num(r.getCell(6).value);
    if (lot !== "CFO" && lot !== "CFA") return void errors.push({ line: n, msg: `Lot invalide « ${lot} »` });
    if (plan === "ERR" || site === "ERR") return void errors.push({ line: n, msg: "Quantité invalide (nombre ≥ 0 attendu)" });
    const system = str(r.getCell(4).value), level = str(r.getCell(2).value);
    if (!system || !level) return void errors.push({ line: n, msg: "Étage ou système manquant" });
    rows.push({ line: n, zone, level, lot, system, plan, site, note: str(r.getCell(12).value) || null });
  });

  const project = await currentProject();
  const [zones, levels, systems] = await Promise.all([
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null } }),
    prisma.level.findMany({ where: { projectId: project.id } }),
    prisma.system.findMany({ where: { projectId: project.id } }),
  ]);
  const zoneMap = new Map<string, string>();
  zones.forEach((z: { name: string; id: string; code: string }) => { zoneMap.set(zoneKey(z.name), z.id); zoneMap.set(norm(z.code), z.id); 
  const m = z.code.match(/\d+/); if (m) zoneMap.set(`zone ${Number(m[0])}`, z.id); });
  const levelMap = new Map<string, string>(
    levels.map((l: { label: string; id: string }) => [norm(l.label), l.id] as [string, string]),
  );
  const sysMap = new Map(systems.map((x) => [`${x.lot}:${norm(x.name)}`, x.id]));

  const newZones = [...new Set(rows.filter((r) => !zoneMap.has(zoneKey(r.zone))).map((r) => r.zone))];
  const newLevels = [...new Set(rows.filter((r) => !levelMap.has(norm(r.level))).map((r) => r.level))];
  const newSystems = [...new Set(rows.filter((r) => !sysMap.has(`${r.lot}:${norm(r.system)}`)).map((r) => `${r.lot} · ${r.system}`))];

  if (!commit) return Response.json({ rows: rows.length, errors, newZones, newLevels, newSystems });
  if (errors.length) return Response.json({ error: "Corrigez les erreurs avant d'importer." }, { status: 400 });

  await prisma.$transaction(async (tx) => {
    let zOrder = zones.reduce((m, z) => Math.max(m, z.order), 0);
    for (const name of newZones) {
      zOrder++;
      const z = await tx.zone.create({ data: { projectId: project.id, code: `Z${String(zOrder).padStart(2, "0")}`, name, order: zOrder } });
      zoneMap.set(zoneKey(name), z.id);
    }
    let lOrder = levels.reduce((m, l) => Math.max(m, l.order), 0);
    for (const label of newLevels) {
      const l = await tx.level.create({ data: { projectId: project.id, label, order: ++lOrder } });
      levelMap.set(norm(label), l.id);
    }
    let sOrder = systems.reduce((m, x) => Math.max(m, x.order), 0);
    for (const r of rows) {
      const key = `${r.lot}:${norm(r.system)}`;
      if (!sysMap.has(key)) {
        const x = await tx.system.create({ data: { projectId: project.id, lot: r.lot, name: r.system, order: ++sOrder } });
        sysMap.set(key, x.id);
      }
    }
    for (const r of rows) {
      const zoneId = zoneMap.get(zoneKey(r.zone))!, levelId = levelMap.get(norm(r.level))!, systemId = sysMap.get(`${r.lot}:${norm(r.system)}`)!;
      const existing = await tx.workItem.findFirst({ where: { projectId: project.id, zoneId, levelId, systemId }, include: { issues: { where: { status: "OUVERT" }, select: { id: true } } } });
      const status = computeStatus({ qtyPlanned: r.plan, qtyDone: r.site, blocked: (existing?.issues.length ?? 0) > 0 });
      const data = { qtyPlanned: r.plan, qtyDone: r.site, status, note: r.note, lastUpdatedAt: new Date(), lastUpdatedById: u.id };
      if (existing) await tx.workItem.update({ where: { id: existing.id }, data: { ...data, deletedAt: null } });
      else await tx.workItem.create({ data: { ...data, projectId: project.id, zoneId, levelId, systemId, lot: r.lot } });
    }
  }, { timeout: 60000, maxWait: 10000 });

  await logAudit(u.id, "Project", project.id, "IMPORT", undefined, { rows: rows.length, newZones, newLevels, newSystems });
  ["/dashboard", "/suivi", "/zones", "/rapports"].forEach((p) => revalidatePath(p));
  return Response.json({ imported: rows.length });
}