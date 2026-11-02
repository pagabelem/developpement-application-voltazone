import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await auth();
  if (!(s?.user as any)?.id) return new Response("Non connecté", { status: 401 });
  const { id } = await params;
  const a = await prisma.attachment.findUnique({ where: { id } });
  if (!a) return new Response("Introuvable", { status: 404 });
  if (a.entity === "MATERIAL" && (s?.user as any)?.role === "CLIENT") return new Response("Accès refusé", { status: 403 });
  try {
    const buf = await readFile(path.join(process.cwd(), "storage", a.id));
    return new Response(new Uint8Array(buf), { headers: { "Content-Type": a.mime, "Content-Disposition": `inline; filename="${encodeURIComponent(a.filename)}"`, "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("Fichier absent du disque", { status: 404 });
  }
}