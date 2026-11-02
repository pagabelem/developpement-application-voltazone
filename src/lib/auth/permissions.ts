import type { Lot, Role } from "@prisma/client";
import { prisma } from "@/lib/db";

export type SessionUser = { id: string; name: string; role: Role; lot: Lot | null };
export type EditScope = { all: boolean; lot: Lot | null; zones: Set<string> };

export const isManager = (u: SessionUser) => u.role === "ADMIN" || u.role === "CONDUCTEUR";
export const isAdmin = (u: SessionUser) => u.role === "ADMIN";
const chefLot = (u: SessionUser): Lot | null => (u.role === "CHEF_CFO" ? "CFO" : u.role === "CHEF_CFA" ? "CFA" : null);

// RG-11 : un chef d'équipe ne modifie que son lot et les zones de ses équipes
export async function getEditScope(u: SessionUser): Promise<EditScope> {
  if (isManager(u)) return { all: true, lot: null, zones: new Set() };
  const lot = chefLot(u);
  if (!lot) return { all: false, lot: null, zones: new Set() };
  const teams = await prisma.team.findMany({ where: { leaderId: u.id, deletedAt: null, lot }, select: { zones: { select: { id: true } } } });
  return { all: false, lot, zones: new Set(teams.flatMap((t) => t.zones.map((z) => z.id))) };
}

export const canEdit = (s: EditScope, i: { lot: Lot; zoneId: string }) => s.all || (s.lot === i.lot && s.zones.has(i.zoneId));
export async function canEditItem(u: SessionUser, i: { lot: Lot; zoneId: string }) {
  return canEdit(await getEditScope(u), i);
}




// Rôles qui peuvent saisir les rapports de terrain (responsables et chefs d'équipe)
export const canWrite = (u: SessionUser) => isManager(u) || u.role === "CHEF_CFO" || u.role === "CHEF_CFA";
export const isClient = (u: SessionUser) => u.role === "CLIENT";