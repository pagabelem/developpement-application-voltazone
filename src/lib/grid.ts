import { prisma } from "@/lib/db";

// Crée les lignes manquantes zone × niveau × système « grille ». Ne modifie jamais une ligne existante.
export async function ensureGrid(projectId: string) {
  const [zones, levels, systems, teams] = await Promise.all([
    prisma.zone.findMany({ where: { projectId, deletedAt: null } }),
    prisma.level.findMany({ where: { projectId } }),
    prisma.system.findMany({ where: { projectId, gridEnabled: true } }),
    prisma.team.findMany({ where: { projectId, deletedAt: null }, include: { zones: { select: { id: true } } } }),
  ]);
  const teamBy = new Map<string, string>();
  for (const t of teams) for (const z of t.zones) if (!teamBy.has(`${t.lot}:${z.id}`)) teamBy.set(`${t.lot}:${z.id}`, t.id);
  const data = zones.flatMap((z) =>
    levels.flatMap((l) => systems.map((s) => ({ projectId, zoneId: z.id, levelId: l.id, systemId: s.id, lot: s.lot, unit: s.defaultUnit, teamId: teamBy.get(`${s.lot}:${z.id}`) ?? null })))
  );
  if (!data.length) return 0;
  const r = await prisma.workItem.createMany({ data, skipDuplicates: true });
  return r.count;
}

export async function gridStats(projectId: string) {
  const [zones, levels, systems, existing] = await Promise.all([
    prisma.zone.count({ where: { projectId, deletedAt: null } }),
    prisma.level.count({ where: { projectId } }),
    prisma.system.count({ where: { projectId, gridEnabled: true } }),
    prisma.workItem.count({ where: { projectId, kind: "GRID", deletedAt: null } }),
  ]);
  return { zones, levels, systems, expected: zones * levels * systems, existing };
}