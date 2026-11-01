"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canEditItem, isManager } from "@/lib/auth/permissions";
import { computeStatus } from "@/lib/domain/calc";
import { logAudit } from "@/lib/audit";

const refreshAll = () => ["/dashboard", "/suivi", "/zones", "/rapports", "/planning", "/blocages", "/terrain"].forEach((p) => revalidatePath(p));

async function refreshStatus(itemId: string, userId: string) {
  const it = await prisma.workItem.findUniqueOrThrow({ where: { id: itemId }, include: { issues: { where: { status: "OUVERT" }, select: { id: true } } } });
  const status = computeStatus({ qtyPlanned: it.qtyPlanned, qtyDone: it.qtyDone, manualProgress: it.manualProgress, blocked: it.issues.length > 0 });
  await prisma.workItem.update({ where: { id: itemId }, data: { status, lastUpdatedAt: new Date(), lastUpdatedById: userId } });
  return status;
}

// Saisie en grille. « Sur plan » = responsables ; « Sur site » = chef d'équipe autorisé (RG-11)
export async function saveQty(input: { itemId: string; field: "qtyPlanned" | "qtyDone"; value: number | null }) {
  const user = await requireUser();
  const p = z.object({ itemId: z.string(), field: z.enum(["qtyPlanned", "qtyDone"]), value: z.number().min(0).nullable() }).parse(input);
  const item = await prisma.workItem.findUnique({ where: { id: p.itemId } });
  if (!item || item.deletedAt) throw new Error("Ligne introuvable");
  const allowed = p.field === "qtyPlanned" ? isManager(user) : await canEditItem(user, item);
  if (!allowed) throw new Error("Accès refusé");

  const openIssues = await prisma.issue.count({ where: { workItemId: item.id, status: "OUVERT" } });
  const next = { qtyPlanned: item.qtyPlanned, qtyDone: item.qtyDone, manualProgress: item.manualProgress, [p.field]: p.value };
    const status = computeStatus({ qtyPlanned: next.qtyPlanned, qtyDone: next.qtyDone, manualProgress: item.manualProgress, blocked: openIssues > 0 });
  const now = new Date();
  const data: Prisma.WorkItemUncheckedUpdateInput = { status, lastUpdatedAt: now, lastUpdatedById: user.id };
  data[p.field] = p.value;
  if (p.field === "qtyDone" && (p.value ?? 0) > 0 && !item.actualStart) data.actualStart = now; // RG-07
  if (status === "TERMINE" && !item.actualEnd) data.actualEnd = now; // RG-07

  await prisma.workItem.update({ where: { id: item.id }, data });
  if (p.field === "qtyDone" && p.value != null)
    await prisma.progressEntry.create({ data: { workItemId: item.id, qtyDoneTotal: p.value, authorId: user.id } });
  await logAudit(user.id, "WorkItem", item.id, "UPDATE_QTY", { [p.field]: item[p.field], status: item.status }, { [p.field]: p.value, status });
  refreshAll();
  return { status };
}

export async function createIssue(fd: FormData) {
  const user = await requireUser();
  const d = z.object({ itemId: z.string(), description: z.string().min(3).max(500) }).parse(Object.fromEntries(fd));
  const item = await prisma.workItem.findUniqueOrThrow({ where: { id: d.itemId } });
  if (!(await canEditItem(user, item))) throw new Error("Accès refusé");
  const issue = await prisma.issue.create({ data: { workItemId: item.id, description: d.description, openedById: user.id } });
  await refreshStatus(item.id, user.id);
  await logAudit(user.id, "Issue", issue.id, "OPEN", undefined, issue);
  refreshAll();
}

export async function resolveIssue(fd: FormData) {
  const user = await requireUser();
  const d = z.object({ issueId: z.string(), resolution: z.string().max(500).optional() }).parse(Object.fromEntries(fd));
  const issue = await prisma.issue.findUniqueOrThrow({ where: { id: d.issueId }, include: { workItem: true } });
  if (!(await canEditItem(user, issue.workItem))) throw new Error("Accès refusé");
  await prisma.issue.update({ where: { id: issue.id }, data: { status: "RESOLU", closedAt: new Date(), resolution: d.resolution || null } });
  await refreshStatus(issue.workItemId, user.id);
  await logAudit(user.id, "Issue", issue.id, "RESOLVE", { status: "OUVERT" }, { status: "RESOLU", resolution: d.resolution });
  refreshAll();
}

export async function updateDates(fd: FormData) {
  const user = await requireUser();
  const d = z.object({ itemId: z.string(), plannedStart: z.string().optional(), plannedEnd: z.string().optional() }).parse(Object.fromEntries(fd));
  const item = await prisma.workItem.findUniqueOrThrow({ where: { id: d.itemId } });
  if (!(await canEditItem(user, item))) throw new Error("Accès refusé");
  const toDate = (s?: string) => (s ? new Date(`${s}T00:00:00Z`) : null);
  const plannedStart = toDate(d.plannedStart), plannedEnd = toDate(d.plannedEnd);
  if (plannedStart && plannedEnd && plannedEnd < plannedStart) throw new Error("La date de fin doit être postérieure au début.");
  await prisma.workItem.update({ where: { id: item.id }, data: { plannedStart, plannedEnd, lastUpdatedAt: new Date(), lastUpdatedById: user.id } });
  await logAudit(user.id, "WorkItem", item.id, "UPDATE_DATES", { plannedStart: item.plannedStart, plannedEnd: item.plannedEnd }, { plannedStart, plannedEnd });
  refreshAll();
}