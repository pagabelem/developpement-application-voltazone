"use server";
import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ARCHIVED, PROJECT_COOKIE, accessibleProjects, requireUser } from "@/lib/session";
import { isAdmin, isManager } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { refreshAll } from "@/lib/revalidate";
import { ensureGrid } from "@/lib/grid";

async function remember(projectId: string) {
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, projectId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
}

// Sélecteur de chantier (barre latérale)
export async function switchProject(fd: FormData) {
  const user = await requireUser();
  const id = String(fd.get("projectId") ?? "");
  if (!(await accessibleProjects(user)).some((p) => p.id === id)) throw new Error("Chantier inaccessible.");
  await remember(id);
  refreshAll();
  redirect("/dashboard"); // les identifiants de l'ancienne page n'existent pas dans l'autre chantier
}

// Création d'un chantier, avec copie facultative de la structure d'un chantier existant
export async function createProject(fd: FormData) {
  const user = await requireUser();
  if (!isManager(user)) throw new Error("Accès refusé");
  const d = z.object({
    name: z.string().trim().min(1).max(120),
    client: z.string().optional(),
    company: z.string().optional(),
    overtimeAfter: z.coerce.number().int().min(1).max(100).default(44),
    copyFrom: z.string().optional(),
    copyZones: z.string().optional(),
  }).parse(Object.fromEntries(fd));

  const src = d.copyFrom ? await prisma.project.findUnique({ where: { id: d.copyFrom } }) : null;
  const copyZones = !!src && !!d.copyZones;
  const [levels, systems, refs, points, zones] = src
    ? await Promise.all([
        prisma.level.findMany({ where: { projectId: src.id } }),
        prisma.system.findMany({ where: { projectId: src.id } }),
        prisma.refItem.findMany({ where: { projectId: src.id } }),
        prisma.checklistPoint.findMany({ where: { projectId: src.id } }),
        copyZones ? prisma.zone.findMany({ where: { projectId: src.id, deletedAt: null } }) : Promise.resolve([]),
      ])
    : [[], [], [], [], []];

  const project = await prisma.$transaction(async (tx) => {
    const np = await tx.project.create({
      data: { name: d.name, client: d.client?.trim() || null, company: d.company?.trim() || null, overtimeAfter: d.overtimeAfter, aggregation: src?.aggregation ?? "MOYENNE", startDate: new Date() },
    });
    if (src) {
      await tx.level.createMany({ data: levels.map((l) => ({ projectId: np.id, label: l.label, order: l.order })) });
      await tx.system.createMany({ data: systems.map((s) => ({ projectId: np.id, lot: s.lot, name: s.name, gridEnabled: s.gridEnabled, defaultUnit: s.defaultUnit, order: s.order })) });
      await tx.refItem.createMany({ data: refs.map((r) => ({ projectId: np.id, kind: r.kind, key: r.key, label: r.label, short: r.short, system: r.system, order: r.order })) });
      await tx.checklistPoint.createMany({ data: points.map((p) => ({ projectId: np.id, system: p.system, label: p.label, order: p.order })) });
      if (copyZones) await tx.zone.createMany({ data: zones.map((z) => ({ projectId: np.id, code: z.code, name: z.name, building: z.building, order: z.order, mainLot: z.mainLot })) });
    }
    return np;
  });
  const gridLines = copyZones ? await ensureGrid(project.id) : 0;
  await logAudit(user.id, "Project", project.id, "CREATE", undefined, { name: project.name, copiedFrom: src?.name ?? null, zones: zones.length, gridLines });
  await remember(project.id); // on bascule directement sur le nouveau chantier
  refreshAll();
  redirect("/dashboard");
}

// Archiver / réactiver (un chantier archivé n'est plus visible des chefs d'équipe et clients)
export async function archiveProject(fd: FormData) {
  const user = await requireUser();
  if (!isManager(user)) throw new Error("Accès refusé");
  const p = await prisma.project.findUniqueOrThrow({ where: { id: String(fd.get("id") ?? "") } });
  const status = p.status === ARCHIVED ? "EN_COURS" : ARCHIVED;
  await prisma.project.update({ where: { id: p.id }, data: { status } });
  await logAudit(user.id, "Project", p.id, status === ARCHIVED ? "ARCHIVE" : "RESTORE", { status: p.status }, { status });
  refreshAll();
}

// Chantiers accessibles à un chef d'équipe ou à un client (administrateur uniquement)

export async function setUserProjects(fd: FormData) {
  const user = await requireUser();

  if (!isAdmin(user)) {
    throw new Error("Accès refusé");
  }

  const userId = String(fd.get("userId") ?? "").trim();

  if (!userId) {
    throw new Error("Utilisateur manquant.");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!target) {
    throw new Error("Utilisateur introuvable.");
  }

  if (!["CHEF_CFO", "CHEF_CFA", "CLIENT"].includes(target.role)) {
    throw new Error(
      "Seuls les chefs d'équipe et les clients peuvent recevoir des affectations manuelles."
    );
  }

  const projectIds = [
    ...new Set(fd.getAll("projectIds").map(String).filter(Boolean)),
  ];

  const validProjects = projectIds.length
    ? await prisma.project.findMany({
        where: {
          id: { in: projectIds },
        },
        select: { id: true },
      })
    : [];

  if (validProjects.length !== projectIds.length) {
    throw new Error("Un ou plusieurs chantiers sont invalides.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectMember.deleteMany({
      where: { userId },
    });

    if (projectIds.length > 0) {
      await tx.projectMember.createMany({
        data: projectIds.map((projectId) => ({
          projectId,
          userId,
        })),
        skipDuplicates: true,
      });
    }
  });

  await logAudit(
    user.id,
    "User",
    userId,
    "SET_PROJECTS",
    undefined,
    {
      email: target.email,
      projets: projectIds.length,
    }
  );

  refreshAll();
}

