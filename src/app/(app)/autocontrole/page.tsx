import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin, isManager } from "@/lib/auth/permissions";
import { addChecklistPoint, loadChecklistPoints, saveChecklist } from "@/lib/actions/rapports";
import { deleteChecklistPoint } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { PageTitle, btn, btnLight, card, input, td, th } from "@/components/ui";
import { DEFAULT_BUILDINGS, isoDay, projectLine } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";

export default async function AutocontrolePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const project = await currentProject();
  const write = canWrite(user), manager = isManager(user), admin = isAdmin(user);
  const scope = sp.scope ?? "";
  const [points, bld] = await Promise.all([
    prisma.checklistPoint.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" }, include: { results: { where: { scope } } } }),
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null, building: { not: null } }, select: { building: true }, distinct: ["building"] }),
  ]);
  const scopes = (await getRef(project.id, "BUILDING")).map((b) => b.label);
  const ok = points.filter((p) => p.results[0]?.result === "CONFORME").length;
  const ko = points.filter((p) => p.results[0]?.result === "NON_CONFORME").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub="Un point « Non conforme » ouvre automatiquement une réserve dans Non-conformités">Autocontrôle avant réception</PageTitle>
        <PrintButton />
      </div>
      <h2 className="hidden text-lg font-bold print:block">FICHE D'AUTOCONTRÔLE AVANT RÉCEPTION — {projectLine(project)}</h2>

      <form className={`${card} flex flex-wrap items-end gap-2 print:hidden`}>
        <Field label="Périmètre contrôlé"><select name="scope" defaultValue={scope} className={input}><option value="">Général (tout le chantier)</option>{scopes.map((s) => <option key={s}>{s}</option>)}</select></Field>
        <button className={btnLight}>Afficher</button>
      </form>

      {points.length === 0 ? (
        <div className={card}>
          <p className="mb-2 text-sm">Aucun point de contrôle défini.</p>
          {manager ? <form action={loadChecklistPoints}><button className={btn}>Charger les 22 points du classeur</button></form> : <p className="text-sm text-slate-500">Un responsable doit d'abord charger la liste.</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className={card}><div className="text-xs text-slate-500">Points conformes</div><div className="text-2xl font-bold text-green-700">{ok}</div></div>
            <div className={card}><div className="text-xs text-slate-500">Points non conformes</div><div className="text-2xl font-bold text-red-700">{ko}</div></div>
            <div className={card}><div className="text-xs text-slate-500">Restant à contrôler</div><div className="text-2xl font-bold">{points.length - ok - ko}</div></div>
          </div>
          <form action={saveChecklist} className={`${card} overflow-x-auto`}>
            <input type="hidden" name="scope" value={scope} />
            <table className="w-full">
              <thead className="bg-slate-50"><tr>{["Système", "Point de contrôle", "Résultat", "Date", "Observation", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {points.map((p) => { const r = p.results[0]; return (
                  <tr key={p.id} className={`border-t text-sm ${r?.result === "NON_CONFORME" ? "bg-red-50" : r?.result === "CONFORME" ? "bg-green-50" : ""}`}>
                    <td className={td}>{p.system}</td><td className={`${td} min-w-64`}>{p.label}</td>
                    <td className={td}>
                      {write ? <select name={`r_${p.id}`} defaultValue={r?.result ?? ""} className={input}><option value="">— à contrôler —</option><option value="CONFORME">Conforme</option><option value="NON_CONFORME">Non conforme</option></select>
                        : r ? (r.result === "CONFORME" ? "Conforme" : "Non conforme") : "—"}
                    </td>
                    <td className={td}>{write ? <input type="date" name={`d_${p.id}`} defaultValue={isoDay(r?.date)} className={input} /> : isoDay(r?.date)}</td>
                    <td className={td}>{write ? <input name={`o_${p.id}`} defaultValue={r?.note ?? ""} className={`${input} w-56`} /> : r?.note}</td>
                    <td className={td}>{admin && <DeleteDialog action={deleteChecklistPoint} fields={{ id: p.id }} label="Suppr." title="Supprimer ce point de contrôle ?" message={`${p.system} — ${p.label} (tous ses résultats seront supprimés).`} />}</td>
                  </tr>); })}
              </tbody>
            </table>
            {write && <div className="mt-3 print:hidden"><button className={btn}>Enregistrer les contrôles</button></div>}
          </form>
        </>
      )}

      {manager && points.length > 0 && (
        <details className={`${card} print:hidden`}>
          <summary className="cursor-pointer text-sm underline">Ajouter un point de contrôle</summary>
          <form action={addChecklistPoint} className="mt-3 flex flex-wrap items-end gap-2">
            <Field label="Système"><input name="system" required placeholder="Ex. Sonorisation" className={input} /></Field>
            <Field label="Point de contrôle"><input name="label" required className={`${input} w-80`} /></Field>
            <button className={btnLight}>Ajouter</button>
          </form>
        </details>
      )}
    </div>
  );
}