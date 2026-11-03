
import { readFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

const isVercel = process.env.VERCEL === "1";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const s = await auth();
  const user = s?.user as any;

  if (!user?.id) {
    return new Response("Non connecté", { status: 401 });
  }

  const { id } = await params;
  const a = await prisma.attachment.findUnique({ where: { id } });

  if (!a) {
    return new Response("Introuvable", { status: 404 });
  }

  if (a.entity === "MATERIAL" && user.role === "CLIENT") {
    return new Response("Accès refusé", { status: 403 });
  }

  try {
    let file: Blob;

    if (a.storagePath) {
      const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .download(a.storagePath);

      if (error || !data) {
        console.error("Erreur téléchargement Supabase :", error);
        return new Response("Fichier introuvable dans le stockage", {
          status: 404,
        });
      }

      file = data;
    } else {
      if (isVercel) {
        return new Response("Fichier absent du stockage distant", {
          status: 404,
        });
      }

      const buf = await readFile(
        path.join(process.cwd(), "storage", a.id)
      );

      file = new Blob([new Uint8Array(buf)], { type: a.mime });
    }

    return new Response(file, {
      headers: {
        "Content-Type": a.mime,
        "Content-Disposition": `inline; filename="${encodeURIComponent(a.filename)}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Erreur lecture fichier :", error);
    return new Response("Impossible de récupérer le fichier", {
      status: 500,
    });
  }
}
