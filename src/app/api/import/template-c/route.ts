import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { getRef } from "@/lib/reference";
import { NC_LABEL, projectLine } from "@/lib/domain/rapport";

export const runtime = "nodejs";
const FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9E1F2" } };

function hdr(ws: ExcelJS.Worksheet, r: number, cols: string[]) {
  const row = ws.getRow(r);
  cols.forEach((c, i) => (row.getCell(i + 1).value = c));
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = FILL; });
  cols.forEach((_, i) => (ws.getColumn(i + 1).width = 24));
}
const statusC = (s: string) => (s === "TERMINE" ? "Terminé" : s === "EN_COURS" || s === "BLOQUE" ? "En cours" : "À faire");

export async function GET() {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id || !["ADMIN", "CONDUCTEUR"].includes(u.role)) return Response.json({ error: "Accès refusé" }, { status: 403 });
  const project = await currentProject();
  const [posts, buildings] = await Promise.all([getRef(project.id, "POST"), getRef(project.id, "BUILDING")]);
  const wb = new ExcelJS.Workbook();
  const sub = projectLine(project);

  // Suivi des tâches : en-têtes ligne 8, données dès la ligne 9
  const tasks = await prisma.workItem.findMany({ where: { projectId: project.id, kind: "TASK", deletedAt: null }, include: { zone: true, system: true }, orderBy: { code: "asc" } });
  const wt = wb.addWorksheet("Suivi des tâches");
  wt.getCell("A1").value = `SUIVI DES TÂCHES RESTANTES — ${sub}`;
  hdr(wt, 8, ["N°", "Tâche", "Zone", "Système", "Statut", "Date", "Responsable", "Observation"]);
  tasks.forEach((i, k) => {
    wt.getRow(9 + k).values = [k + 1, i.title ?? "", i.location ?? i.zone.name, i.system?.name ?? "", statusC(i.status), i.lastUpdatedAt, i.responsible ?? "", i.note ?? ""];
    wt.getCell(9 + k, 6).numFmt = "dd/mm/yyyy";
  });
  for (let r = 9; r <= 300; r++) wt.getCell(r, 5).dataValidation = { type: "list", allowBlank: true, formulae: ['"À faire,En cours,Terminé"'] };

  // État d'avancement : date en B3, postes dès la ligne 6 (A = poste, C = % en fraction)
  const last = await prisma.postProgress.findFirst({ where: { projectId: project.id }, orderBy: { date: "desc" }, select: { date: true } });
  const snap = last ? await prisma.postProgress.findMany({ where: { projectId: project.id, date: last.date } }) : [];
  const we = wb.addWorksheet("État d'avancement");
  we.getCell("A1").value = `ÉTAT D'AVANCEMENT — ${sub}`;
  we.getCell("A3").value = "Date";
  we.getCell("B3").value = last?.date ?? new Date();
  we.getCell("B3").numFmt = "dd/mm/yyyy";
  hdr(we, 5, ["Poste", "Système", "Avancement (%)", "Reste (%)", "Observation"]);
  posts.forEach((p, k) => {
    const g = snap.find((x) => !x.building && x.post === p.key);
    we.getRow(6 + k).values = [p.label, p.system ?? "", g ? g.percent / 100 : null, null, g?.note ?? ""];
    we.getCell(6 + k, 3).numFmt = "0%";
    we.getCell(6 + k, 4).value = { formula: `IF(C${6 + k}="","",1-C${6 + k})` };
  });

  // Avancement par bâtiment : en-têtes ligne 3 (B..), bâtiments dès la ligne 4
  const wb2 = wb.addWorksheet("Avancement par bâtiment");
  wb2.getCell("A1").value = `AVANCEMENT PAR BÂTIMENT — ${sub}`;
  hdr(wb2, 3, ["Bâtiment", ...posts.map((p) => p.short ?? p.label)]);
  buildings.forEach((b, k) => {
    wb2.getCell(4 + k, 1).value = b.label;
    posts.forEach((p, j) => {
      const v = snap.find((x) => x.building === b.label && x.post === p.key);
      if (v) { wb2.getCell(4 + k, 2 + j).value = v.percent / 100; wb2.getCell(4 + k, 2 + j).numFmt = "0%"; }
    });
  });

  // Non-conformités : en-têtes ligne 3, données dès la ligne 4
  const ncs = await prisma.nonConformity.findMany({ where: { projectId: project.id }, orderBy: { number: "asc" } });
  const wn = wb.addWorksheet("Non-conformités");
  wn.getCell("A1").value = `FICHE DE NON-CONFORMITÉ / RÉSERVES — ${sub}`;
  hdr(wn, 3, ["N°", "Date", "Zone", "Système", "Description", "Action corrective", "Responsable", "Statut"]);
  ncs.forEach((n, k) => {
    wn.getRow(4 + k).values = [n.number, n.date, n.zoneLabel ?? "", n.system ?? "", n.description, n.action ?? "", n.responsible ?? "", NC_LABEL[n.status]];
    wn.getCell(4 + k, 2).numFmt = "dd/mm/yyyy";
  });
  for (let r = 4; r <= 300; r++) wn.getCell(r, 8).dataValidation = { type: "list", allowBlank: true, formulae: ['"Ouvert,En cours,Levé"'] };

  // Demande matériel : date en B2, chantier en E2, en-têtes ligne 4, lignes dès la ligne 5
  const wm = wb.addWorksheet("Demande matériel");
  wm.getCell("A1").value = `DEMANDE DE MATÉRIEL — ${sub}`;
  wm.getCell("A2").value = "Date";
  wm.getCell("B2").value = new Date();
  wm.getCell("B2").numFmt = "dd/mm/yyyy";
  wm.getCell("D2").value = "Chantier";
  hdr(wm, 4, ["N°", "Désignation", "Référence", "Unité", "Quantité", "Date souhaitée", "Système", "Observation"]);

  // Historique par période : en-têtes ligne 3, données dès la ligne 4
  const per = await prisma.periodLog.findMany({ where: { projectId: project.id }, orderBy: { startDate: "asc" } });
  const wh = wb.addWorksheet("Historique par période");
  wh.getCell("A1").value = `HISTORIQUE PAR PÉRIODE — ${sub}`;
  hdr(wh, 3, ["Du", "Au", "Durée (j)", "Type de travaux", "Zone", "Système", "Travaux réalisés", "Avancement", "Observation"]);
  per.forEach((p, k) => {
    const r = 4 + k;
    wh.getRow(r).values = [p.startDate, p.endDate, null, p.workType, p.zoneLabel ?? "", p.system ?? "", p.work, p.percent == null ? null : p.percent / 100, p.note ?? ""];
    wh.getCell(r, 1).numFmt = wh.getCell(r, 2).numFmt = "dd/mm/yyyy";
    wh.getCell(r, 3).value = { formula: `IF(OR(A${r}="",B${r}=""),"",B${r}-A${r}+1)` };
    wh.getCell(r, 8).numFmt = "0%";
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="modele_import_classeur_C.xlsx"' },
  });
}