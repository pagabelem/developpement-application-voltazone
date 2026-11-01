import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { buildWhere } from "@/lib/filters";
import { currentProject } from "@/lib/session";
import { ecart, itemProgress, reste, rowProgress, STATUS_LABEL } from "@/lib/domain/calc";

export const runtime = "nodejs";
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

export async function GET(req: Request) {
  const s = await auth();
  if (!(s?.user as any)?.id) return Response.json({ error: "Non connecté" }, { status: 401 });
  const params = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string | undefined>;
  const task = params.kind === "TASK";
  const project = await currentProject();
  const orderBy: Prisma.WorkItemOrderByWithRelationInput[] = task
    ? [{ code: "asc" }]
    : [{ zone: { order: "asc" } }, { level: { order: "asc" } }, { lot: "asc" }, { system: { order: "asc" } }];
  const items = await prisma.workItem.findMany({
    where: buildWhere(project.id, params),
    include: { zone: true, level: true, system: true, team: { include: { leader: true } }, issues: { where: { status: "OUVERT" }, select: { description: true } } },
    orderBy,
  });

  const header = task
    ? ["ID", "Zone", "Lot", "Système / spécialité", "Tâche / activité", "Localisation précise", "Responsable / Chef d’équipe", "Équipe / matricules", "Effectif prévu", "Date début prévue", "Date fin prévue", "Date début réelle", "Date fin réelle", "Statut", "Avancement (%)", "Unité", "Quantité prévue", "Quantité réalisée", "Reste à faire", "Matériel / câble", "Blocage / observation", "Dernière mise à jour"]
    : ["Zone", "Étage", "Lot", "Système", "Sur plan", "Sur site", "Écart", "Avancement", "Statut", "Chef d'équipe", "Techniciens", "Remarque"];
  const chef = (i: (typeof items)[number]) => i.team?.leaderName ?? i.team?.leader?.name ?? "";
  const rows: (string | number | null)[][] = items.map((i) =>
    task
      ? [i.code, i.zone.code, i.lot, i.system?.name ?? "", i.title ?? "", i.location ?? "", i.responsible ?? chef(i), i.crew ?? "", i.plannedHeadcount, day(i.plannedStart), day(i.plannedEnd), day(i.actualStart), day(i.actualEnd), STATUS_LABEL[i.status], Math.round((itemProgress(i) ?? 0) * 100), i.unit, i.qtyPlanned, i.qtyDone, reste(i.qtyPlanned, i.qtyDone), i.material ?? "", [...i.issues.map((x) => x.description), i.note].filter(Boolean).join(" | "), day(i.lastUpdatedAt)]
      : [i.zone.name, i.level?.label ?? "", i.lot, i.system?.name ?? i.title ?? "", i.qtyPlanned, i.qtyDone, ecart(i.qtyPlanned, i.qtyDone), rowProgress(i.qtyPlanned, i.qtyDone), STATUS_LABEL[i.status], chef(i), i.team?.headcount ?? "", i.note ?? ""]
  );

  if (params.format === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = "\uFEFF" + [header, ...rows.map((r) => r.map((v, k) => (!task && k === 7 && typeof v === "number" ? Math.round(v * 100) + "%" : v)))].map((r) => r.map(esc).join(";")).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${task ? "taches" : "suivi"}.csv"` } });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(task ? "Suivi des travaux" : "Suivi");
  ws.addRow(header).font = { bold: true };
  rows.forEach((r) => {
    const row = ws.addRow(r);
    if (!task) row.getCell(8).numFmt = "0%";
    row.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r[2] === "CFA" ? "FFDDEBF7" : "FFFCE4D6" } }; });
  });
  ws.columns.forEach((c) => (c.width = 18));
  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${task ? "taches" : "suivi"}.xlsx"` },
  });
}