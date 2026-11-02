import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin } from "@/lib/auth/permissions";
import { saveNc } from "@/lib/actions/rapports";
import { deleteNc } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { PageTitle, btn, btnLight, card, input } from "@/components/ui";
import { NC_LABEL, fr, isoDay, projectLine } from "@/lib/domain/rapport";
import { Attachments } from "@/components/attachments";

const COLOR: Record<string, string> = { OUVERT: "border-l-red-500", EN_COURS: "border-l-amber-500", LEVE: "border-l-green-500 opacity-70" };

export default async function NcPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const project = await currentProject();
  const write = canWrite(user), admin = isAdmin(user);
  const status = sp.status === "OUVERT" || sp.status === "EN_COURS" || sp.status === "LEVE" ? sp.status : undefined;
  const [list, all] = await Promise.all([
    prisma.nonConformity.findMany({ where: { projectId: project.id, ...(status ? { status } : {}) }, orderBy: { number: "desc" }, take: 300 }),
    prisma.nonConformity.groupBy({ by: ["status"], where: { projectId: project.id }, _count: true }),
  ]);
  const count = (s: string) => all.find((a) => a.status === s)?._count ?? 0;
  const openCount = count("OUVERT") + count("EN_COURS");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub="Fiche de non-conformité / réserves">Non-conformités</PageTitle>
        <PrintButton />
      </div>
      <h2 className="hidden text-lg font-bold print:block">FICHE DE NON-CONFORMITÉ / RÉSERVES — {projectLine(project)}</h2>

      <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
        <span className="rounded bg-red-100 px-3 py-1 font-semibold text-red-800">Réserves ouvertes : {openCount}</span>
        {[["", "Toutes"], ["OUVERT", "Ouvertes"], ["EN_COURS", "En cours"], ["LEVE", "Levées"]].map(([k, l]) => (
          <Link key={k} href={k ? `/non-conformites?status=${k}` : "/non-conformites"} className={`rounded border px-3 py-1 ${(status ?? "") === k ? "bg-slate-900 text-white" : "bg-white"}`}>{l}</Link>
        ))}
      </div>

      {write && (
        <details className={`${card} print:hidden`} open={sp.new === "1"}>
          <summary className="cursor-pointer font-semibold">+ Nouvelle non-conformité</summary>
          <form action={saveNc} className="mt-3 grid gap-3 md:grid-cols-4">
            <Field label="Date"><input type="date" name="date" defaultValue={isoDay(new Date())} className={input} /></Field>
            <Field label="Zone / bâtiment"><input name="zoneLabel" className={input} /></Field>
            <Field label="Système"><input name="system" className={input} /></Field>
            <Field label="Statut"><select name="status" className={input}><option value="OUVERT">Ouvert</option><option value="EN_COURS">En cours</option><option value="LEVE">Levé</option></select></Field>
            <Field label="Description" wide><input name="description" required className={input} /></Field>
            <Field label="Action corrective"><input name="action" className={input} /></Field>
            <Field label="Responsable"><input name="responsible" className={input} /></Field>
            <div><button className={btn}>Créer</button></div>
          </form>
        </details>
      )}

      <div className="space-y-2">
        {list.map((n) => (
          <div key={n.id} className={`${card} border-l-4 ${COLOR[n.status]}`}>
            {write ? (
              <form action={saveNc} className="grid gap-2 md:grid-cols-4">
                <input type="hidden" name="id" value={n.id} />
                <div className="flex items-center gap-2 text-sm font-semibold md:col-span-4">N° {n.number}<span className="font-normal text-slate-500">{fr(n.date)}{n.source ? " · issue de l'autocontrôle" : ""}</span></div>
                <Field label="Date"><input type="date" name="date" defaultValue={isoDay(n.date)} className={input} /></Field>
                <Field label="Zone"><input name="zoneLabel" defaultValue={n.zoneLabel ?? ""} className={input} /></Field>
                <Field label="Système"><input name="system" defaultValue={n.system ?? ""} className={input} /></Field>
                <Field label="Statut"><select name="status" defaultValue={n.status} className={input}>{Object.entries(NC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                <Field label="Description" wide><input name="description" defaultValue={n.description} className={input} /></Field>
                <Field label="Action corrective"><input name="action" defaultValue={n.action ?? ""} className={input} /></Field>
                <Field label="Responsable"><input name="responsible" defaultValue={n.responsible ?? ""} className={input} /></Field>
                <div className="flex items-center gap-4 print:hidden"><button className={btnLight}>Enregistrer</button>
                  {admin && <DeleteDialog action={deleteNc} fields={{ id: n.id }} label="Supprimer" title="Supprimer cette non-conformité ?" message={`N° ${n.number} — ${n.description}`} />}</div>
              </form>
            ) : (
              <>
                <div className="text-sm"><b>N° {n.number}</b> · {fr(n.date)} · {n.zoneLabel} · {n.system} — {n.description} <span className="ml-2 font-semibold">{NC_LABEL[n.status]}</span></div>
                <div className="mt-2"><Attachments entity="NC" entityId={n.id} canUpload={write} admin={admin} /></div>
              </>
            )}
          </div>
        ))}
        {list.length === 0 && <p className="text-slate-500">Aucune non-conformité.</p>}
      </div>
    </div>
  );
}