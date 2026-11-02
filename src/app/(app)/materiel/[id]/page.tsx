import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin, isClient } from "@/lib/auth/permissions";
import { saveMaterial } from "@/lib/actions/rapports";
import { deleteMaterial } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { RowsEditor } from "@/components/rows-editor";
import { PageTitle, btn, btnLight, card, input } from "@/components/ui";
import { MATERIAL_LABEL, fr, isoDay, projectLine, utcDay } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";
import { Attachments } from "@/components/attachments";

export default async function MaterielDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isClient(user)) redirect("/dashboard");
  const project = await currentProject();
  const write = canWrite(user), admin = isAdmin(user);
  const [req, sites] = await Promise.all([
    id === "new" ? null : prisma.materialRequest.findUnique({ where: { id }, include: { lines: { orderBy: { position: "asc" } } } }),
    getRef(project.id, "BUILDING"),
  ]);


  if (id !== "new" && !req) {
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
      <p className="font-semibold text-amber-900">Demande introuvable</p>
      <p>Aucune demande de matériel n'existe avec l'identifiant <code>{id}</code> : elle a peut-être été supprimée.</p>
      <a href="/materiel" className="underline">Retour à la liste</a>
    </div>
  );
}
  const initial = (req?.lines ?? []).map((l) => ({ designation: l.designation, reference: l.reference, unit: l.unit, quantity: l.quantity, wantedDate: isoDay(l.wantedDate), system: l.system, note: l.note }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub={req ? `Demande n° ${req.number} — ${req.lines.length} ligne(s)` : "Nouvelle demande"}>Demande de matériel</PageTitle>
        <PrintButton />
      </div>
      <h2 className="hidden text-lg font-bold print:block">DEMANDE DE MATÉRIEL / BON DE COMMANDE INTERNE — {projectLine(project)}{req ? ` — N° ${req.number}` : ""}</h2>
      <form action={saveMaterial} className={`${card} space-y-4`}>
        {req && <input type="hidden" name="id" value={req.id} />}
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Date"><input type="date" name="date" defaultValue={isoDay(req?.date ?? utcDay())} className={input} /></Field>
          <Field label="Chantier"><input name="site" list="sites" defaultValue={req?.site ?? ""} className={input} /><datalist id="sites">{sites.map((s) => <option key={s.id} value={s.label} />)}</datalist></Field>
          <Field label="Statut"><select name="status" defaultValue={req?.status ?? "BROUILLON"} className={input}>{Object.entries(MATERIAL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <RowsEditor
          prefix="m" keyCol="designation" minRows={10} showIndex addLabel="Ajouter un article" footerLabel="Nombre d'articles" footer={{ designation: "count" }}
          columns={[
            { key: "designation", label: "Désignation", w: "min-w-56" }, { key: "reference", label: "Référence", w: "w-28" }, { key: "unit", label: "Unité", w: "w-16" },
            { key: "quantity", label: "Quantité", type: "number", step: "any", min: 0, w: "w-24" }, { key: "wantedDate", label: "Date souhaitée", type: "date" },
            { key: "system", label: "Système", w: "w-32" }, { key: "note", label: "Observation" },
          ]}
          initial={initial}
        />
        {write && <div className="flex gap-2 print:hidden"><button className={btn}>{req ? "Enregistrer la demande" : "Créer la demande"}</button><a href="/materiel" className={btnLight}>Retour à la liste</a></div>}
      </form>

{req && (
  <div className={card}>
    <div className="mb-2 text-sm font-semibold">Devis, factures, reçus</div>
    <Attachments entity="MATERIAL" entityId={req.id} canUpload={write} admin={admin} />
  </div>
)}


      {req && admin && <div className="print:hidden"><DeleteDialog action={deleteMaterial} fields={{ id: req.id }} label="Supprimer cette demande" title="Supprimer cette demande ?" message={`Demande n° ${req.number} du ${fr(req.date)} et ses ${req.lines.length} ligne(s).`} /></div>}
    </div>
  );
}