import { prisma } from "@/lib/db";
import { DEFAULT_BUILDINGS, POSTES, REPORT_SYSTEMS, WORK_TYPES } from "@/lib/domain/rapport";

export type RefKind = "BUILDING" | "POST" | "REPORT_SYSTEM" | "WORK_TYPE";
type Def = { key: string; label: string; short?: string; system?: string };

function defaults(kind: RefKind): Def[] {
  if (kind === "POST") return POSTES.map((p) => ({ key: p.key, label: p.label, short: p.short, system: p.system }));
  const list = kind === "BUILDING" ? DEFAULT_BUILDINGS : kind === "REPORT_SYSTEM" ? REPORT_SYSTEMS : WORK_TYPES;
  return list.map((l) => ({ key: l, label: l }));
}

// Lit une liste ; à la première lecture, la remplit avec les valeurs du classeur Excel
export async function getRef(projectId: string, kind: RefKind) {
  const read = () => prisma.refItem.findMany({ where: { projectId, kind }, orderBy: [{ order: "asc" }, { label: "asc" }] });
  let items = await read();
  if (items.length === 0) {
    const defs = defaults(kind);
    if (kind === "BUILDING") {
      const zs = await prisma.zone.findMany({ where: { projectId, deletedAt: null, building: { not: null } }, select: { building: true }, distinct: ["building"] });
      zs.forEach((z) => { if (z.building && !defs.some((d) => d.key === z.building)) defs.push({ key: z.building, label: z.building }); });
    }
    await prisma.refItem.createMany({ data: defs.map((d, i) => ({ projectId, kind, key: d.key, label: d.label, short: d.short ?? null, system: d.system ?? null, order: i + 1 })), skipDuplicates: true });
    items = await read();
  }
  return items;
}

export const slug = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toUpperCase().slice(0, 30) || "POSTE";