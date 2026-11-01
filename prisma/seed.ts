import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "Voltazone2026!";
const ZONES = ["Accès principal / parvis", "Tribune Nord", "Tribune Sud", "Tribune Est", "Tribune Ouest", "Terrain / éclairage sportif", "Vestiaires joueurs", "Locaux techniques / TGBT", "Administration / médias", "Parking / locaux annexes"];
// Systèmes de la grille plan/site (classeur B)
const GRID_CFA = ["Prises RJ45", "Caméras int", "Caméras ext", "Contrôle d'accès", "Détection incendie", "Sirènes", "Sonorisation"];
const GRID_CFO = ["Éclairage", "Prises 220V", "Tableaux électriques", "Chemins de câbles"];
// Systèmes propres aux tâches (classeur A)
const TASK_CFA = ["Vidéosurveillance", "Réseau informatique"];
const TASK_CFO = ["Prises et alimentation", "Éclairage sportif"];

async function main() {
  if ((await prisma.project.count()) > 0) return console.log("Base déjà initialisée.");
  const project = await prisma.project.create({ data: { name: "Projet stade", client: "À renseigner", siteName: "Stade", startDate: new Date() } });
  const projectId = project.id;

  await prisma.zone.createMany({ data: ZONES.map((n, i) => ({ projectId, code: `Z${String(i + 1).padStart(2, "0")}`, name: `Zone ${String(i + 1).padStart(2, "0")} — ${n}`, order: i + 1 })) });
  await prisma.level.createMany({ data: [{ projectId, label: "RDC", order: 1 }, { projectId, label: "Étage 1", order: 2 }] });
  await prisma.system.createMany({
    data: [
      ...GRID_CFA.map((name, i) => ({ projectId, lot: "CFA" as const, name, order: i + 1 })),
      ...GRID_CFO.map((name, i) => ({ projectId, lot: "CFO" as const, name, order: i + 1 })),
      ...TASK_CFA.map((name, i) => ({ projectId, lot: "CFA" as const, name, order: 20 + i, gridEnabled: false })),
      ...TASK_CFO.map((name, i) => ({ projectId, lot: "CFO" as const, name, order: 20 + i, gridEnabled: false })),
    ],
  });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const mk = (name: string, email: string, role: "ADMIN" | "CONDUCTEUR" | "CHEF_CFO" | "CHEF_CFA" | "CLIENT", lot?: "CFO" | "CFA") =>
    prisma.user.create({ data: { name, email, role, lot: lot ?? null, passwordHash } });
  await mk("Administrateur", "admin@voltazone.local", "ADMIN");
  await mk("Conducteur de travaux", "conducteur@voltazone.local", "CONDUCTEUR");
  const chefCfo = await mk("Chef équipe CFO", "chef.cfo@voltazone.local", "CHEF_CFO", "CFO");
  const chefCfa = await mk("Chef équipe CFA", "chef.cfa@voltazone.local", "CHEF_CFA", "CFA");
  await mk("Client MOA", "client@voltazone.local", "CLIENT");

  const zones = await prisma.zone.findMany({ where: { projectId } });
  // Équipes d'exemple du classeur A (feuille Équipes)
  const TEAMS = [
    { lot: "CFO" as const, name: "Chef d’équipe CFO 1", zones: ["Z01", "Z02", "Z06"], chef: chefCfo.id },
    { lot: "CFO" as const, name: "Chef d’équipe CFO 2", zones: ["Z03", "Z08", "Z10"], chef: null },
    { lot: "CFA" as const, name: "Chef d’équipe CFA 1", zones: ["Z01", "Z02", "Z04"], chef: chefCfa.id },
    { lot: "CFA" as const, name: "Chef d’équipe CFA 2", zones: ["Z03", "Z05", "Z07", "Z09"], chef: null },
  ];
  const teamBy = new Map<string, string>();
  for (const t of TEAMS) {
    const ids = zones.filter((z) => t.zones.includes(z.code));
    const team = await prisma.team.create({ data: { projectId, lot: t.lot, name: t.name, leaderName: t.name, leaderId: t.chef, zones: { connect: ids.map((z) => ({ id: z.id })) } } });
    ids.forEach((z) => teamBy.set(`${t.lot}:${z.id}`, team.id));
  }

  const levels = await prisma.level.findMany({ where: { projectId } });
  const systems = await prisma.system.findMany({ where: { projectId, gridEnabled: true } });
  await prisma.workItem.createMany({
    data: zones.flatMap((z) =>
      levels.flatMap((l) => systems.map((s) => ({ projectId, zoneId: z.id, levelId: l.id, systemId: s.id, lot: s.lot, unit: s.defaultUnit, teamId: teamBy.get(`${s.lot}:${z.id}`) ?? null })))
    ),
  });
  console.log(`OK : 220 lignes de grille. Mot de passe des comptes de test : ${PASSWORD}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());