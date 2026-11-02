import { prisma } from "@/lib/db";
import { DeleteDialog } from "@/components/delete-dialog";
import { deleteAttachment } from "@/lib/actions/delete";
import { AttachmentUploader } from "@/components/attachment-uploader";

export async function Attachments({ entity, entityId, canUpload, admin }: { entity: string; entityId: string; canUpload: boolean; admin: boolean }) {
  const items = await prisma.attachment.findMany({ where: { entity, entityId }, orderBy: { createdAt: "asc" } });
  return (
    <div className="space-y-2 print:hidden">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {items.map((a) => (
            <div key={a.id} className="w-32 text-xs">
              {a.mime.startsWith("image/")
                ? <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer"><img src={`/api/files/${a.id}`} alt={a.filename} className="h-24 w-32 rounded border object-cover" /></a>
                : <a href={`/api/files/${a.id}`} target="_blank" rel="noreferrer" className="block rounded border p-2 underline">📄 {a.filename}</a>}
              {admin && <DeleteDialog action={deleteAttachment} fields={{ id: a.id }} label="Suppr." title="Supprimer ce fichier ?" message={a.filename} />}
            </div>
          ))}
        </div>
      )}
      {canUpload && <AttachmentUploader entity={entity} entityId={entityId} />}
    </div>
  );
}