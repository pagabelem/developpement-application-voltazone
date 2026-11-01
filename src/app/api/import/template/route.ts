import ExcelJS from "exceljs";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { itemProgress, reste, STATUS_LABEL } from "@/lib/domain/calc";

export const runtime = "nodejs";

function sheet(wb: ExcelJS.Workbook, name: string, cols: string[]) {
  const ws = wb.addWorksheet(name);
  const r = ws.addRow(cols);
  r.font = { bold: true };
  r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } }; });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  cols.forEach((_, i) => (ws.getColumn(i + 1).width = 22));
  return ws;
}
function help(wb: ExcelJS.Workbook, lines: string[]) {
  const ws = wb.addWorksheet("Mode d'emploi");
  ws.getColumn(1).width = 110;
  ws.addRow(["MODE D'EMPLOI"]).font = { bold: true };
  lines.forEach((l) => ws.addRow([l]));
}

export async function GET(req: Request) {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id || !["ADMIN", "CONDUCTEUR"].includes(u.role)) return Response.json({ error: "Accès refusé" }, { status: 403 });
  const type = new URL(req.url).searchParams.get("type") === "B" ? "B" : "A";
  const project = await currentProject();
  const wb = new ExcelJS.Workbook();

  if (type === "A") {
    const [zones, teams, tasks] = await Promise.all([
      prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" } }),
      prisma.team.findMany({ where: { projectId: project.id, deletedAt: null }, include: { zones: { select: { code: true } } }, orderBy: [{ lot: "asc" }, { name: "asc" }] }),
      prisma.workItem.findMany({ where: { projectId: project.id, kind: "TASK", deletedAt: null }, include: { zone: true, system: true }, orderBy: { code: "asc" } }),
    ]);
    const wz = sheet(wb, "Zones", ["Code zone", "Zone / secteur du stade", "Bâtiment / niveau", "Lot principal", "Chef d’équipe / responsable", "Effectif prévu", "Effectif présent", "Avancement (%)", "Statut", "Observations"]);
    zones.forEach((z) => wz.addRow([z.code, z.name, z.building ?? "", z.mainLot, z.leaderName ?? "", z.plannedHeadcount, "", "", "", z.note ?? ""]));
    const we = sheet(wb, "Équipes", ["Lot", "Nom du Chef d’équipe", "Matricule / identifiant", "Zone(s) suivie(s)", "Effectif équipe", "Date de début", "Téléphone / contact (si autorisé)", "Remarques"]);
    teams.forEach((t) => { const r = we.addRow([t.lot, t.leaderName ?? t.name, t.matricule ?? "", t.zones.map((z) => z.code).join(", "), t.headcount, t.startDate, t.phone ?? "", t.note ?? ""]); r.getCell(6).numFmt = "dd/mm/yyyy"; });
    const wt = sheet(wb, "Suivi des travaux", ["ID", "Zone", "Lot", "Système / spécialité", "Tâche / activité", "Localisation précise", "Responsable / Chef d’équipe", "Équipe / matricules", "Effectif prévu", "Date début prévue", "Date fin prévue", "Date début réelle", "Date fin réelle", "Statut", "Avancement (%)", "Unité", "Quantité prévue", "Quantité réalisée", "Reste à faire", "Matériel / câble", "Blocage / observation", "Dernière mise à jour"]);
    tasks.forEach((i) => {
      const r = wt.addRow([i.code, i.zone.code, i.lot, i.system?.name ?? "", i.title ?? "", i.location ?? "", i.responsible ?? "", i.crew ?? "", i.plannedHeadcount, i.plannedStart, i.plannedEnd, i.actualStart, i.actualEnd, STATUS_LABEL[i.status], Math.round((itemProgress(i) ?? 0) * 100), i.unit, i.qtyPlanned, i.qtyDone, reste(i.qtyPlanned, i.qtyDone), i.material ?? "", i.note ?? "", i.lastUpdatedAt]);
      [10, 11, 12, 13, 22].forEach((c) => (r.getCell(c).numFmt = "dd/mm/yyyy"));
    });
    for (let r = 2; r <= 500; r++) { // listes déroulantes
      wt.getCell(`B${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ["Zones!$A$2:$A$200"] };
      wt.getCell(`C${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"CFO,CFA"'] };
      wt.getCell(`N${r}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"À faire,En cours,Terminé,Bloqué"'] };
    }
    help(wb, [
      "1. Ne changez pas les titres des colonnes ni le nom des feuilles (Zones, Équipes, Suivi des travaux).",
      "2. Une ligne = une zone / une équipe / une tâche. Les données actuelles de l'application sont déjà dans le fichier.",
      "3. Colonne Zone : utilisez le code (Z01, Z02…). Les zones d'une équipe se notent « Z01, Z02, Z06 ».",
      "4. Dates au format jj/mm/aaaa. Laissez vide ce qui est inconnu.",
      "5. Une tâche au statut « Bloqué » crée un blocage ; le texte de la colonne Blocage / observation en devient le motif.",
      "6. Avancement (%) n'est utilisé que si la tâche n'a pas de quantité prévue.",
      "7. Dans l'application : Import → choisir ce fichier → Prévisualiser → Importer.",
    ]);
  } else {
    const items = await prisma.workItem.findMany({
      where: { projectId: project.id, kind: "GRID", deletedAt: null },
      include: { zone: true, level: true, system: true, team: { include: { leader: true } } },
      orderBy: [{ zone: { order: "asc" } }, { level: { order: "asc" } }, { lot: "asc" }, { system: { order: "asc" } }],
    });
    const ws = sheet(wb, "Suivi", ["Zone", "Étage", "Lot", "Système", "Sur plan", "Sur site", "Écart", "Avancement", "Statut", "Chef d'équipe", "Techniciens", "Remarque"]);
    items.forEach((i, k) => {
      const n = k + 2;
      const r = ws.addRow([i.zone.name, i.level?.label ?? "", i.lot, i.system?.name ?? "", i.qtyPlanned, i.qtyDone, null, null, STATUS_LABEL[i.status], i.team?.leaderName ?? i.team?.leader?.name ?? "", i.team?.headcount ?? "", i.note ?? ""]);
      r.getCell(7).value = { formula: `IF(OR(E${n}="",F${n}=""),"",F${n}-E${n})` };
      r.getCell(8).value = { formula: `IF(OR(E${n}="",E${n}=0,F${n}=""),"",MIN(1,F${n}/E${n}))` };
      r.getCell(8).numFmt = "0%";
    });
    help(wb, [
      "1. Ne changez pas les titres des colonnes ni le nom de la feuille « Suivi ».",
      "2. Chaque ligne = une zone × un étage × un système. Remplissez Sur plan (quantité comptée sur le plan) et Sur site (quantité réalisée).",
      "3. Écart et Avancement se calculent seuls dans Excel ; l'application recalcule aussi tout à l'import.",
      "4. Zones, étages et systèmes absents sont créés à l'import.",
      "5. Dans l'application : Import → choisir ce fichier → Prévisualiser → Importer.",
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="modele_import_classeur_${type}.xlsx"` },
  });
}