import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { getRef } from "@/lib/reference";
import { NC_LABEL, MATERIAL_LABEL, mondayOf, parseDay, projectLine } from "@/lib/domain/rapport";

export const runtime = "nodejs";
const FILL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFD9E1F2" } };
const D = "dd/mm/yyyy";

function hdr(ws: ExcelJS.Worksheet, r: number, cols: string[]) {
  const row = ws.getRow(r);
  cols.forEach((c, i) => (row.getCell(i + 1).value = c));
  row.font = { bold: true };
  row.eachCell((c) => { c.fill = FILL; c.alignment = { wrapText: true, vertical: "middle" }; });
}
function title(ws: ExcelJS.Worksheet, text: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { bold: true, size: 13 };
  c.alignment = { wrapText: true, vertical: "middle" };
  ws.getRow(1).height = 38;
}
const widths = (ws: ExcelJS.Worksheet, w: number[]) => w.forEach((x, i) => (ws.getColumn(i + 1).width = x));
const statusC = (s: string) => (s === "TERMINE" ? "Terminé" : s === "EN_COURS" || s === "BLOQUE" ? "En cours" : "À faire");

export async function GET(req: Request) {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id) return Response.json({ error: "Non connecté" }, { status: 401 });
  const client = u.role === "CLIENT";
  const q = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string | undefined>;
  const project = await currentProject();
  const sub = projectLine(project);
  const [posts, buildings] = await Promise.all([getRef(project.id, "POST"), getRef(project.id, "BUILDING")]);
  const wb = new ExcelJS.Workbook();

  // 1. Rapport journalier (celui demandé, sinon le plus récent)
  const rep = q.report
    ? await prisma.dailyReport.findUnique({ where: { id: q.report }, include: { workers: true, systems: true } })
    : await prisma.dailyReport.findFirst({ where: { projectId: project.id }, orderBy: { date: "desc" }, include: { workers: true, systems: true } });
  const w1 = wb.addWorksheet("Rapport journalier");
  widths(w1, [38, 22, 22, 14, 50]);
  title(w1, `RAPPORT JOURNALIER DE CHANTIER – COURANT FAIBLE\n${sub}`, 5);
  ([["Date", rep?.date], ["Chantier", rep?.site], ["Zone / Étage", rep?.zoneLabel], ["Chef d'équipe", rep?.leaderName], ["Météo", rep?.weather]] as [string, Date | string | null | undefined][])
    .forEach(([k, v], i) => { w1.getCell(3 + i, 1).value = k; w1.getCell(3 + i, 2).value = v ?? ""; });
  w1.getCell("B3").numFmt = D;
  let r = 9;
  w1.getCell(r, 1).value = "EFFECTIF PRÉSENT";
  w1.getCell(r++, 1).font = { bold: true };
  hdr(w1, r++, ["Nom", "Fonction", "Heures", "", "Observation"]);
  const a0 = r;
  (rep?.workers ?? []).forEach((w) => w1.getRow(r++).values = [w.name, w.role ?? "", w.hours ?? "", "", w.note ?? ""]);
  if (r === a0) r += 3;
  w1.getRow(r).values = ["Effectif total", { formula: `COUNTA(A${a0}:A${r - 1})` }, { formula: `SUM(C${a0}:C${r - 1})` }, "h total"];
  r += 2;
  w1.getCell(r, 1).value = "TRAVAUX RÉALISÉS PAR SYSTÈME";
  w1.getCell(r++, 1).font = { bold: true };
  hdr(w1, r++, ["Système", "Avancement veille (%)", "Avancement aujourd'hui (%)", "Total (%)", "Travaux réalisés"]);
  const s0 = r;
  (rep?.systems ?? []).forEach((x) => {
    w1.getRow(r).values = [x.system, x.previousPct / 100, x.todayPct / 100, { formula: `MIN(1,B${r}+C${r})` }, x.work ?? ""];
    [2, 3, 4].forEach((c) => (w1.getCell(r, c).numFmt = "0%"));
    r++;
  });
  if (r === s0) r += 3;
  w1.getRow(r).values = ["Avancement global (moyenne)", "", "", { formula: `IFERROR(AVERAGE(D${s0}:D${r - 1}),"")` }];
  w1.getCell(r, 4).numFmt = "0%";
  r += 2;
  const blocks: [string, string | null | undefined][] = [
    ["PROBLÈMES / INTERFÉRENCES AVEC AUTRES CORPS D'ÉTAT", rep?.issuesText], ["MATÉRIEL REÇU / MANQUANT / DEMANDÉ", rep?.materialText],
    ["POINTS SÉCURITÉ (accidents, quasi-accidents, causerie)", rep?.safetyText], ["TRAVAUX PRÉVUS DEMAIN", rep?.tomorrowText],
  ];
  for (const [h, v] of blocks) {
    w1.getCell(r, 1).value = h;
    w1.getCell(r++, 1).font = { bold: true };
    w1.mergeCells(r, 1, r, 5);
    w1.getCell(r, 1).value = v ?? "";
    w1.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    w1.getRow(r).height = 45;
    r += 2;
  }
  w1.getCell(r, 1).value = `Visa chef d'équipe : ${rep?.leaderVisaBy ?? ""}`;
  w1.getCell(r, 4).value = `Visa conducteur de travaux : ${rep?.managerVisaBy ?? ""}`;

  // 2 et 3. État d'avancement et matrice par bâtiment
  const date = parseDay(q.date) ?? (await prisma.postProgress.findFirst({ where: { projectId: project.id }, orderBy: { date: "desc" }, select: { date: true } }))?.date ?? new Date();
  const snap = await prisma.postProgress.findMany({ where: { projectId: project.id, date } });
  const w2 = wb.addWorksheet("État d'avancement");
  widths(w2, [38, 24, 16, 14, 50]);
  title(w2, `ÉTAT D'AVANCEMENT\n${sub}`, 5);
  w2.getCell("A3").value = "Date";
  w2.getCell("B3").value = date;
  w2.getCell("B3").numFmt = D;
  hdr(w2, 5, ["Poste", "Système", "Avancement (%)", "Reste (%)", "Observation"]);
  posts.forEach((p, k) => {
    const g = snap.find((x) => !x.building && x.post === p.key), n = 6 + k;
    w2.getRow(n).values = [p.label, p.system ?? "", g ? g.percent / 100 : null, { formula: `IF(C${n}="","",1-C${n})` }, g?.note ?? ""];
    w2.getCell(n, 3).numFmt = w2.getCell(n, 4).numFmt = "0%";
  });
  const e2 = 6 + posts.length;
  w2.getRow(e2).values = ["Avancement global (moyenne simple)", "", { formula: `IFERROR(AVERAGE(C6:C${e2 - 1}),"")` }];
  w2.getCell(e2, 3).numFmt = "0%";

  const w3 = wb.addWorksheet("Avancement par bâtiment");
  widths(w3, [28, ...posts.map(() => 20), 18]);
  title(w3, `AVANCEMENT PAR BÂTIMENT\n${sub}`, posts.length + 2);
  hdr(w3, 3, ["Bâtiment", ...posts.map((p) => p.short ?? p.label), "Moyenne bâtiment"]);
  const colL = (n: number) => String.fromCharCode(64 + n);
  buildings.forEach((b, k) => {
    const n = 4 + k;
    w3.getCell(n, 1).value = b.label;
    posts.forEach((p, j) => {
      const v = snap.find((x) => x.building === b.label && x.post === p.key);
      if (v) w3.getCell(n, 2 + j).value = v.percent / 100;
      w3.getCell(n, 2 + j).numFmt = "0%";
    });
    w3.getCell(n, posts.length + 2).value = { formula: `IFERROR(AVERAGE(B${n}:${colL(posts.length + 1)}${n}),"")` };
    w3.getCell(n, posts.length + 2).numFmt = "0%";
  });
  const e3 = 4 + buildings.length;
  w3.getCell(e3, 1).value = "Moyenne par poste";
  for (let j = 2; j <= posts.length + 2; j++) {
    w3.getCell(e3, j).value = { formula: `IFERROR(AVERAGE(${colL(j)}4:${colL(j)}${e3 - 1}),"")` };
    w3.getCell(e3, j).numFmt = "0%";
  }

  // 4. Pointage (masqué pour le profil Client)
  if (!client) {
    const week = mondayOf(parseDay(q.week) ?? new Date()), site = q.site ?? "";
    const entries = await prisma.timesheetEntry.findMany({ where: { projectId: project.id, weekStart: week, site }, orderBy: { name: "asc" } });
    const w4 = wb.addWorksheet("Pointage");
    widths(w4, [28, 18, 7, 7, 7, 7, 7, 7, 12, 10, 30]);
    title(w4, `FEUILLE DE POINTAGE – ÉQUIPE COURANT FAIBLE\n${sub}`, 11);
    w4.getCell("A2").value = "Chantier :";
    w4.getCell("B2").value = site;
    w4.getCell("F2").value = "Semaine du :";
    w4.getCell("G2").value = week;
    w4.getCell("G2").numFmt = D;
    hdr(w4, 4, ["Nom & Prénom", "Fonction", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Total heures", "H. sup.", "Observation"]);
    const rows = Math.max(entries.length, 12);
    for (let k = 0; k < rows; k++) {
      const n = 5 + k, e = entries[k];
      w4.getRow(n).values = [e?.name ?? "", e?.role ?? "", e?.h1 ?? "", e?.h2 ?? "", e?.h3 ?? "", e?.h4 ?? "", e?.h5 ?? "", e?.h6 ?? "", { formula: `SUM(C${n}:H${n})` }, { formula: `MAX(0,I${n}-${project.overtimeAfter})` }, e?.note ?? ""];
    }
    const t = 5 + rows;
    w4.getCell(t, 1).value = "TOTAL";
    for (let j = 3; j <= 10; j++) w4.getCell(t, j).value = { formula: `SUM(${colL(j)}5:${colL(j)}${t - 1})` };
    w4.getRow(t).font = { bold: true };
  }

  // 5. Autocontrôle
  const scope = q.scope ?? "";
  const points = await prisma.checklistPoint.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" }, include: { results: { where: { scope } } } });
  const w5 = wb.addWorksheet("Autocontrôle");
  widths(w5, [22, 55, 12, 14, 14, 40]);
  title(w5, `FICHE D'AUTOCONTRÔLE AVANT RÉCEPTION\n${sub}`, 6);
  hdr(w5, 3, ["Système", "Point de contrôle", "Conforme", "Non conforme", "Date", "Observation"]);
  points.forEach((p, k) => {
    const x = p.results[0];
    w5.getRow(4 + k).values = [p.system, p.label, x?.result === "CONFORME" ? "X" : "", x?.result === "NON_CONFORME" ? "X" : "", x?.date ?? "", x?.note ?? ""];
    w5.getCell(4 + k, 5).numFmt = D;
  });
  const e5 = 4 + points.length + 1;
  w5.getRow(e5).values = ["Points conformes", { formula: `COUNTIF(C4:C${e5 - 2},"X")` }];
  w5.getRow(e5 + 1).values = ["Points non conformes", { formula: `COUNTIF(D4:D${e5 - 2},"X")` }];

  // 6. Non-conformités
  const ncs = await prisma.nonConformity.findMany({ where: { projectId: project.id }, orderBy: { number: "asc" } });
  const w6 = wb.addWorksheet("Non-conformités");
  widths(w6, [8, 13, 20, 20, 50, 40, 20, 12]);
  title(w6, `FICHE DE NON-CONFORMITÉ / RÉSERVES\n${sub}`, 8);
  hdr(w6, 3, ["N°", "Date", "Zone", "Système", "Description", "Action corrective", "Responsable", "Statut"]);
  ncs.forEach((n, k) => {
    w6.getRow(4 + k).values = [n.number, n.date, n.zoneLabel ?? "", n.system ?? "", n.description, n.action ?? "", n.responsible ?? "", NC_LABEL[n.status]];
    w6.getCell(4 + k, 2).numFmt = D;
  });
  const e6 = 4 + ncs.length + 1;
  w6.getRow(e6).values = ["Réserves ouvertes", "", "", "", { formula: `COUNTIF(H4:H${e6 - 2},"Ouvert")+COUNTIF(H4:H${e6 - 2},"En cours")` }];

  // 7. Demande de matériel (masquée pour le profil Client)
  if (!client) {
    const mat = q.material
      ? await prisma.materialRequest.findUnique({ where: { id: q.material }, include: { lines: { orderBy: { position: "asc" } } } })
      : await prisma.materialRequest.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, include: { lines: { orderBy: { position: "asc" } } } });
    const w7 = wb.addWorksheet("Demande matériel");
    widths(w7, [8, 45, 18, 10, 12, 16, 20, 30]);
    title(w7, `DEMANDE DE MATÉRIEL / BON DE COMMANDE INTERNE\n${sub}${mat ? ` — N° ${mat.number} (${MATERIAL_LABEL[mat.status]})` : ""}`, 8);
    w7.getCell("A2").value = "Date";
    w7.getCell("B2").value = mat?.date ?? new Date();
    w7.getCell("B2").numFmt = D;
    w7.getCell("D2").value = "Chantier";
    w7.getCell("E2").value = mat?.site ?? "";
    hdr(w7, 4, ["N°", "Désignation", "Référence", "Unité", "Quantité", "Date souhaitée", "Système", "Observation"]);
    (mat?.lines ?? []).forEach((l, k) => {
      w7.getRow(5 + k).values = [k + 1, l.designation, l.reference ?? "", l.unit ?? "", l.quantity ?? "", l.wantedDate ?? "", l.system ?? "", l.note ?? ""];
      w7.getCell(5 + k, 6).numFmt = D;
    });
  }

  // 8. Suivi des tâches
  const tasks = await prisma.workItem.findMany({ where: { projectId: project.id, kind: "TASK", deletedAt: null }, include: { zone: true, system: true }, orderBy: { code: "asc" } });
  const w8 = wb.addWorksheet("Suivi des tâches");
  widths(w8, [8, 45, 22, 22, 14, 13, 24, 40]);
  title(w8, `SUIVI DES TÂCHES RESTANTES\n${sub}`, 8);
  const l8 = 9 + Math.max(tasks.length, 1) - 1;
  w8.getRow(3).values = ["Total tâches", { formula: `COUNTA(B9:B${l8})` }];
  w8.getRow(4).values = ["Terminées", { formula: `COUNTIF(E9:E${l8},"Terminé")` }];
  w8.getRow(5).values = ["En cours", { formula: `COUNTIF(E9:E${l8},"En cours")` }];
  w8.getRow(6).values = ["À faire", { formula: `COUNTIF(E9:E${l8},"À faire")` }];
  w8.getRow(7).values = ["Avancement (terminées / total)", { formula: `IFERROR(B4/B3,0)` }];
  w8.getCell("B7").numFmt = "0%";
  hdr(w8, 8, ["N°", "Tâche", "Zone", "Système", "Statut", "Date", "Responsable", "Observation"]);
  tasks.forEach((i, k) => {
    w8.getRow(9 + k).values = [k + 1, i.title ?? "", i.location ?? i.zone.name, i.system?.name ?? "", statusC(i.status), i.lastUpdatedAt ?? "", i.responsible ?? "", i.note ?? ""];
    w8.getCell(9 + k, 6).numFmt = D;
  });

  // 9. Historique par période
  const per = await prisma.periodLog.findMany({ where: { projectId: project.id }, orderBy: { startDate: "asc" } });
  const w9 = wb.addWorksheet("Historique par période");
  widths(w9, [13, 13, 11, 28, 20, 20, 50, 12, 30]);
  title(w9, `HISTORIQUE DES TRAVAUX PAR PÉRIODE\n${sub}`, 9);
  hdr(w9, 3, ["Du", "Au", "Durée (j)", "Type de travaux", "Zone", "Système", "Travaux réalisés", "Avancement", "Observation"]);
  per.forEach((p, k) => {
    const n = 4 + k;
    w9.getRow(n).values = [p.startDate, p.endDate, { formula: `IF(OR(A${n}="",B${n}=""),"",B${n}-A${n}+1)` }, p.workType, p.zoneLabel ?? "", p.system ?? "", p.work, p.percent == null ? "" : p.percent / 100, p.note ?? ""];
    w9.getCell(n, 1).numFmt = w9.getCell(n, 2).numFmt = D;
    w9.getCell(n, 8).numFmt = "0%";
  });
  const e9 = 4 + per.length + 1;
  w9.getRow(e9).values = ["Total jours", "", { formula: `SUM(C4:C${e9 - 2})` }];

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="rapport_chantier_courant_faible.xlsx"' },
  });
}