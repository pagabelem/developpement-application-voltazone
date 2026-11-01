import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth/permissions";

export async function requireUser(): Promise<SessionUser> {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id) redirect("/login");
  return { id: u.id, name: u.name ?? "", role: u.role, lot: u.lot ?? null };
}

export async function currentProject() {
  const p = await prisma.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (!p) throw new Error("Aucun chantier : lancez « npm run db:seed ».");
  return p;
}