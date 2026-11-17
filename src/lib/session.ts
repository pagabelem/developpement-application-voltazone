import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Project } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/permissions";

export const PROJECT_COOKIE = "voltazone_project";
export const ARCHIVED = "ARCHIVE";

export async function requireUser(): Promise<SessionUser> {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id) redirect("/login");
  return { id: u.id, name: u.name ?? "", role: u.role, lot: u.lot ?? null };
}

// ADMIN et CONDUCTEUR voient tous les chantiers ; chefs d'équipe et clients, uniquement ceux auxquels ils sont affectés
// (et jamais les chantiers archivés)
export async function accessibleProjects(
  u: { id: string; role: string }
): Promise<Project[]> {
  const all = u.role === "ADMIN" || u.role === "CONDUCTEUR";

  return prisma.project.findMany({
    where: all
      ? {}
      : {
          status: { not: ARCHIVED },
          members: {
            some: { userId: u.id },
          },
        },
    orderBy: { createdAt: "asc" },
  });
}

// Chantier demandé (cookie) s'il est accessible, sinon le premier chantier actif
export function pickProject(projects: Project[], wantedId?: string | null): Project | null {
  return projects.find((p) => p.id === wantedId) ?? projects.find((p) => p.status !== ARCHIVED) ?? projects[0] ?? null;
}

export async function projectContext() {
  const user = await requireUser();
  const projects = await accessibleProjects(user);
  const wanted = (await cookies()).get(PROJECT_COOKIE)?.value;
  return { user, projects, project: pickProject(projects, wanted) };
}

export async function currentProject() {
  const { project } = await projectContext();
  if (!project) throw new Error("Aucun chantier disponible : un administrateur doit vous affecter à un chantier.");
  return project;
}