import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { currentProject } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { supabase, STORAGE_BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

const isVercel = process.env.VERCEL === "1";

export async function POST(req: Request) {
  const s = await auth();
  const u = s?.user as any;

  if (!u?.id || !["ADMIN", "CONDUCTEUR", "CHEF_CFO", "CHEF_CFA"].includes(u.role)) {
    return Response.json({ error: "Accès refusé" }, { status: 403 });
  }

  const fd = await req.formData();
  const entity = String(fd.get("entity"));
  const entityId = String(fd.get("entityId") ?? "");

  if (!["NC", "DAILY_REPORT", "MATERIAL"].includes(entity) || !entityId) {
    return Response.json({ error: "Requête invalide" }, { status: 400 });
  }

  const files = fd.getAll("file").filter(
    (f): f is File => f instanceof File && f.size > 0
  );

  if (!files.length) {
    return Response.json({ error: "Choisissez au moins un fichier." }, { status: 400 });
  }

  for (const f of files) {
    if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) {
      return Response.json(
        { error: "Formats acceptés : JPG, PNG, WEBP, PDF." },
        { status: 400 }
      );
    }

    if (f.size > 8 * 1024 * 1024) {
      return Response.json(
        { error: "Fichier trop volumineux (8 Mo max)." },
        { status: 400 }
      );
    }
  }

  const project = await currentProject();

  if (!isVercel) {
    await mkdir(path.join(process.cwd(), "storage"), { recursive: true });
  }

  try {
    for (const f of files) {
      const a = await prisma.attachment.create({
        data: {
          projectId: project.id,
          entity,
          entityId,
          filename: f.name.slice(0, 120),
          mime: f.type,
          size: f.size,
          uploadedBy: u.name ?? null,
        },
      });

      const storagePath = `${project.id}/${entity}/${a.id}`;

      try {
        if (isVercel) {
          const { error } = await supabase.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, f, {
              contentType: f.type,
              upsert: false,
            });

          if (error) throw error;

          await prisma.attachment.update({
            where: { id: a.id },
            data: { storagePath },
          });
        } else {
          await writeFile(
            path.join(process.cwd(), "storage", a.id),
            Buffer.from(await f.arrayBuffer())
          );
        }
      } catch (error) {
        if (isVercel) {
          await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
        }

        await prisma.attachment.delete({ where: { id: a.id } });
        throw error;
      }
    }

    await logAudit(u.id, "Attachment", entityId, "UPLOAD", undefined, {
      entity,
      fichiers: files.length,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Erreur upload fichier :", error);
    return Response.json(
      { error: "Impossible d'enregistrer les fichiers." },
      { status: 500 }
    );
  }
}
