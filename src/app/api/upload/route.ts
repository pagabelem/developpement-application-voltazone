import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const s = await auth();
  const u = s?.user as any;
  if (!u?.id || !["ADMIN", "CONDUCTEUR", "CHEF_CFO", "CHEF_CFA"].includes(u.role)) return Response.json({ error: "Accès refusé" }, { status: 403 });
  const fd = await req.formData();
  const entity = String(fd.get("entity"));
  const entityId = String(fd.get("entityId") ?? "");
  if (!["NC", "DAILY_REPORT", "MATERIAL"].includes(entity) || !entityId) return Response.json({ error: "Requête invalide" }, { status: 400 });
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return Response.json({ error: "Choisissez au moins un fichier." }, { status: 400 });
  const dir = path.join(process.cwd(), "storage");
  await mkdir(dir, { recursive: true });
  const project = await currentProject();
  for (const f of files) {
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) return Response.json({ error: "Formats acceptés : JPG, PNG, WEBP, PDF." }, { status: 400 });
    if (f.size > 8 * 1024 * 1024) return Response.json({ error: "Fichier trop volumineux (8 Mo max)." }, { status: 400 });
    const a = await prisma.attachment.create({ data: { projectId: project.id, entity, entityId, filename: f.name.slice(0, 120), mime: f.type, size: f.size, uploadedBy: u.name ?? null } });
    await writeFile(path.join(dir, a.id), Buffer.from(await f.arrayBuffer()));
  }
  await logAudit(u.id, "Attachment", entityId, "UPLOAD", undefined, { entity, fichiers: files.length });
  return Response.json({ ok: true });
}