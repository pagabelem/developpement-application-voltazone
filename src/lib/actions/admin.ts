"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin, isManager } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { refreshAll } from "@/lib/revalidate";

import { redirect } from "next/navigation";
import { ensureGrid } from "@/lib/grid";


async function mgr() {
  const u = await requireUser();
  if (!isManager(u)) throw new Error("Accès refusé");
  return u;
}

export async function upsertZone(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const num = z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(0).optional());
  const d = z.object({
    id: z.string().optional(), code: z.string().max(10).optional(), name: z.string().min(1).max(120), building: z.string().optional(),
    order: z.coerce.number().int().default(0), mainLot: z.string().optional(), leaderName: z.string().optional(), plannedHeadcount: num, note: z.string().optional(),
  }).parse(Object.fromEntries(fd));

  let code = d.code?.trim().toUpperCase();
  if (!code) {
    // code automatique : numéro le plus élevé (zones archivées comprises) + 1
    const all = await prisma.zone.findMany({ where: { projectId: p.id }, select: { code: true } });
    const max = all.reduce((m, x) => Math.max(m, Number(x.code.replace(/\D/g, "")) || 0), 0);
    code = `Z${String(max + 1).padStart(2, "0")}`;
  }
  const dup = await prisma.zone.findFirst({ where: { projectId: p.id, code, ...(d.id ? { NOT: { id: d.id } } : {}) } });
  if (dup) throw new Error(`Le code ${code} existe déjà${dup.deletedAt ? " (zone archivée)" : ""}. Choisissez un autre code ou laissez le champ vide.`);

  const data = { code, name: d.name, building: d.building || null, order: d.order, mainLot: d.mainLot || "CFO/CFA", leaderName: d.leaderName || null, plannedHeadcount: d.plannedHeadcount ?? null, note: d.note || null };
  const zone = d.id ? await prisma.zone.update({ where: { id: d.id }, data }) : await prisma.zone.create({ data: { ...data, projectId: p.id } });
  const created = d.id ? 0 : await ensureGrid(p.id); // la nouvelle zone apparaît tout de suite dans le Suivi
  await logAudit(u.id, "Zone", zone.id, d.id ? "UPDATE" : "CREATE", undefined, { ...data, gridLinesCreated: created });
  refreshAll();
}

export async function archiveZone(fd: FormData) {
  const u = await mgr();
  const id = String(fd.get("id"));
  await prisma.zone.update({ where: { id }, data: { deletedAt: new Date() } });
  await prisma.workItem.updateMany({ where: { zoneId: id }, data: { deletedAt: new Date() } });
  await logAudit(u.id, "Zone", id, "ARCHIVE");
  refreshAll();
}

export async function addLevel(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const d = z.object({ label: z.string().min(1).max(40), order: z.coerce.number().int().default(0) }).parse(Object.fromEntries(fd));
  const l = await prisma.level.create({ data: { ...d, projectId: p.id } });
  const created = await ensureGrid(p.id);
  await logAudit(u.id, "Level", l.id, "CREATE", undefined, { ...d, gridLinesCreated: created });
  refreshAll();
}

export async function addSystem(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const d = z.object({ lot: z.enum(["CFO", "CFA"]), name: z.string().min(1).max(60), defaultUnit: z.string().min(1).max(10).default("u"), order: z.coerce.number().int().default(0), gridEnabled: z.string().optional() }).parse(Object.fromEntries(fd));
  const { gridEnabled, ...rest } = d;
  const s = await prisma.system.create({ data: { ...rest, gridEnabled: !!gridEnabled, projectId: p.id } });
  const created = gridEnabled ? await ensureGrid(p.id) : 0;
  await logAudit(u.id, "System", s.id, "CREATE", undefined, { ...d, gridLinesCreated: created });
  refreshAll();
}

// EF-14 : génère les lignes manquantes zone × niveau × système
export async function generateGrid() {
  const u = await mgr();
  const p = await currentProject();
  const created = await ensureGrid(p.id);
  await logAudit(u.id, "Project", p.id, "GENERATE_GRID", undefined, { created });
  refreshAll();
  redirect(`/parametres?grid=${created}`);
}


export async function saveTeam(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();

  const d = z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    lot: z.enum(["CFO", "CFA"]),
    leaderId: z.string().optional(),
    leaderName: z.string().optional(),
    matricule: z.string().optional(),
    headcount: z.coerce.number().int().min(0).default(0),
    phone: z.string().optional(),
    startDate: z.string().optional(),
    note: z.string().optional(),
  }).parse(Object.fromEntries(fd));

  const teamId = d.id?.trim() || null;
  const leaderId = d.leaderId?.trim() || null;
  const zoneIds = [...new Set(fd.getAll("zoneIds").map(String).filter(Boolean))];

  // Vérifier que l'équipe appartient au chantier courant.
  if (teamId) {
    const existing = await prisma.team.findFirst({
      where: {
        id: teamId,
        projectId: p.id,
      },
      select: { id: true },
    });

    if (!existing) {
      throw new Error("Équipe introuvable dans ce chantier.");
    }
  }

  // Vérifier que toutes les zones appartiennent au chantier courant.
  if (zoneIds.length > 0) {
    const count = await prisma.zone.count({
      where: {
        id: { in: zoneIds },
        projectId: p.id,
        deletedAt: null,
      },
    });

    if (count !== zoneIds.length) {
      throw new Error(
        "Certaines zones sont invalides ou appartiennent à un autre chantier."
      );
    }
  }

  // Vérifier le responsable sélectionné.
  if (leaderId) {
    const expectedRole =
      d.lot === "CFO" ? "CHEF_CFO" : "CHEF_CFA";

    const leader = await prisma.user.findFirst({
      where: {
        id: leaderId,
        active: true,
        role: expectedRole,
        projects: {
          some: {
            projectId: p.id,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!leader) {
      throw new Error(
        "Le chef doit être actif, avoir le rôle correspondant au lot et être affecté à ce chantier."
      );
    }
  }

  const startDate = d.startDate
    ? new Date(`${d.startDate}T00:00:00.000Z`)
    : null;

  if (startDate && Number.isNaN(startDate.getTime())) {
    throw new Error("Date de début invalide.");
  }

  const data = {
    name: d.name,
    lot: d.lot,
    leaderId,
    leaderName: d.leaderName?.trim() || null,
    matricule: d.matricule?.trim() || null,
    headcount: d.headcount,
    phone: d.phone?.trim() || null,
    startDate,
    note: d.note?.trim() || null,
  };

  const team = await prisma.$transaction(async (tx) => {
    const saved = teamId
      ? await tx.team.update({
          where: { id: teamId },
          data: {
            ...data,
            zones: {
              set: zoneIds.map((id) => ({ id })),
            },
          },
        })
      : await tx.team.create({
          data: {
            ...data,
            projectId: p.id,
            zones: {
              connect: zoneIds.map((id) => ({ id })),
            },
          },
        });

    // Affecter uniquement les lignes encore sans équipe.
    if (zoneIds.length > 0) {
      await tx.workItem.updateMany({
        where: {
          projectId: p.id,
          lot: d.lot,
          zoneId: { in: zoneIds },
          teamId: null,
        },
        data: {
          teamId: saved.id,
        },
      });
    }

    return saved;
  });

  await logAudit(
    u.id,
    "Team",
    team.id,
    teamId ? "UPDATE" : "CREATE",
    undefined,
    { ...data, zoneIds }
  );

  refreshAll();
}



export async function archiveTeam(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();

  const id = String(fd.get("id") ?? "").trim();

  if (!id) {
    throw new Error("Identifiant d'équipe manquant.");
  }

  const team = await prisma.team.findFirst({
    where: {
      id,
      projectId: p.id,
      deletedAt: null,
    },
  });

  if (!team) {
    throw new Error("Équipe introuvable dans ce chantier.");
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { deletedAt: new Date() },
  });

  await logAudit(u.id, "Team", id, "ARCHIVE");

  refreshAll();
}


export async function setAggregation(fd: FormData) {
  const u = await mgr();
  const p = await currentProject();
  const aggregation = z.enum(["MOYENNE", "SOMME"]).parse(fd.get("aggregation"));
  await prisma.project.update({ where: { id: p.id }, data: { aggregation } });
  await logAudit(u.id, "Project", p.id, "SET_AGGREGATION", { aggregation: p.aggregation }, { aggregation });
  refreshAll();
}


export async function createUser(fd: FormData) {
  const u = await requireUser();

  if (!isAdmin(u)) {
    throw new Error("Accès refusé");
  }

  const d = z.object({
    name: z.string().trim().min(2),
    email: z.string().email(),
    password: z.string().min(8),
    role: z.enum([
      "ADMIN",
      "CONDUCTEUR",
      "CHEF_CFO",
      "CHEF_CFA",
      "CLIENT",
    ]),
  }).parse(Object.fromEntries(fd));

  const projectIds = [
    ...new Set(fd.getAll("projectIds").map(String).filter(Boolean)),
  ];

  const isRestricted =
    d.role === "CHEF_CFO" ||
    d.role === "CHEF_CFA" ||
    d.role === "CLIENT";

 

  const validProjects = projectIds.length
    ? await prisma.project.findMany({
        where: {
          id: { in: projectIds },
        },
        select: { id: true },
      })
    : [];

  if (validProjects.length !== projectIds.length) {
    throw new Error("Un ou plusieurs chantiers sélectionnés sont invalides.");
  }

  const lot =
    d.role === "CHEF_CFO"
      ? "CFO"
      : d.role === "CHEF_CFA"
        ? "CFA"
        : null;

  const passwordHash = await bcrypt.hash(d.password, 10);

  const created = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: d.name,
        email: d.email.toLowerCase(),
        role: d.role,
        lot,
        passwordHash,
      },
    });

    if (isRestricted && projectIds.length > 0) {
  await tx.projectMember.createMany({
    data: projectIds.map((projectId) => ({
      projectId,
      userId: user.id,
    })),
  });
}

    return user;
  });

  await logAudit(u.id, "User", created.id, "CREATE", undefined, {
    email: created.email,
    role: created.role,
    projets: projectIds.length,
  });

  refreshAll();
}


export async function toggleUser(fd: FormData) {
  const u = await requireUser();
  if (!isAdmin(u)) throw new Error("Accès refusé");
  const id = String(fd.get("id"));
  if (id === u.id) throw new Error("Vous ne pouvez pas vous désactiver.");
  const target = await prisma.user.findUniqueOrThrow({ where: { id } });
  await prisma.user.update({ where: { id }, data: { active: !target.active } });
  await logAudit(u.id, "User", id, target.active ? "DEACTIVATE" : "ACTIVATE");
  refreshAll();
}