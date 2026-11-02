import Link from "next/link";
import type { ReactNode } from "react";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEdit, getEditScope, isAdmin, isManager } from "@/lib/auth/permissions";
import { buildWhere } from "@/lib/filters";
import { isLate, itemProgress, reste, STATUS_LABEL } from "@/lib/domain/calc";
import { archiveTask, saveTask } from "@/lib/actions/tasks";
import { deleteItemsByFilter, deleteWorkItem } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { Bar, LotBadge, PageTitle, StatusBadge, btn, btnLight, card, fmtDate, input, td, th } from "@/components/ui";
import { QtyCell } from "@/components/qty-cell";

const F = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
  <label className={`flex flex-col gap-1 text-xs text-slate-600 ${wide ? "md:col-span-2" : ""}`}>{label}{children}</label>
);
const HEAD = ["ID", "Zone", "Lot", "Système / spécialité", "Tâche / activité", "Localisation", "Responsable", "Équipe", "Eff.", "Début prévu", "Fin prévue", "Début réel", "Fin réelle", "Statut", "Avancement", "Unité", "Prévue", "Réalisée", "Reste", "Matériel / câble", "Blocage / observation", "Dernière MAJ", ""];

export default async function TachesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const project = await currentProject();
  const scope = await getEditScope(user);
  const manager = isManager(user);
  const where = buildWhere(project.id, { ...sp, kind: "TASK" });
  const active = Object.fromEntries(["zone", "lot", "status", "late"].filter((k) => sp[k]).map((k) => [k, sp[k] as string]));
  const hasFilter = Object.keys(active).length > 0;

  const [total, items, zones, systems, editing] = await Promise.all([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({ where, include: { zone: true, system: true, team: { include: { leader: true } } }, orderBy: [{ code: "asc" }], take: 500 }),
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" } }),
    prisma.system.findMany({ where: { projectId: project.id }, orderBy: [{ lot: "asc" }, { order: "asc" }] }),
    sp.edit ? prisma.workItem.findUnique({ where: { id: sp.edit } }) : null,
  ]);
  const t = editing && canEdit(scope, editing) ? editing : null;
  const showForm = (manager && sp.new === "1") || !!t;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle sub={`${total} tâche(s) — équivalent de la feuille « Suivi des travaux »`}>Tâches</PageTitle>
        <div className="flex gap-2">
          {manager && <Link href="/taches?new=1" className={btn}>+ Nouvelle tâche</Link>}
          <Link href="/taches?open=1" className={btnLight}>Tâches restantes (urgent)</Link>
          
          <a href="/api/export/suivi?format=xlsx&kind=TASK" className={btnLight}>Excel</a>
        </div>
      </div>



{(() => {
  const done = items.filter((i) => i.status === "TERMINE").length;
  const doing = items.filter((i) => i.status === "EN_COURS").length;
  const todo = items.filter((i) => i.status === "A_FAIRE").length;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <div className={card}><div className="text-xs text-slate-500">Total tâches</div><div className="text-2xl font-bold">{total}</div></div>
      <div className={card}><div className="text-xs text-slate-500">Terminées</div><div className="text-2xl font-bold text-green-700">{done}</div></div>
      <div className={card}><div className="text-xs text-slate-500">En cours</div><div className="text-2xl font-bold text-blue-700">{doing}</div></div>
      <div className={card}><div className="text-xs text-slate-500">À faire</div><div className="text-2xl font-bold">{todo}</div></div>
      <div className={card}><div className="text-xs text-slate-500">Avancement (terminées / total)</div><div className="text-2xl font-bold">{total ? Math.round((done / total) * 100) : 0} %</div></div>
    </div>
  );
})()}





      {showForm && (
        <form action={saveTask} className={`${card} grid gap-3 md:grid-cols-4`}>
          {t && <input type="hidden" name="id" value={t.id} />}
          {manager ? (
            <>
              <F label="ID (auto si vide)"><input name="code" defaultValue={t?.code ?? ""} className={input} /></F>
              <F label="Zone"><select name="zoneId" required defaultValue={t?.zoneId ?? ""} className={input}><option value="">—</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.code} · {z.name}</option>)}</select></F>
              <F label="Lot"><select name="lot" defaultValue={t?.lot ?? "CFO"} className={input}><option>CFO</option><option>CFA</option></select></F>
              <F label="Système / spécialité"><select name="systemId" defaultValue={t?.systemId ?? ""} className={input}><option value="">—</option>{systems.map((s) => <option key={s.id} value={s.id}>{s.lot} · {s.name}</option>)}</select></F>
              <F label="Tâche / activité" wide><input name="title" required defaultValue={t?.title ?? ""} className={input} /></F>
              <F label="Localisation précise"><input name="location" defaultValue={t?.location ?? ""} className={input} /></F>
              <F label="Responsable / chef d'équipe"><input name="responsible" defaultValue={t?.responsible ?? ""} className={input} /></F>
              <F label="Équipe / matricules"><input name="crew" defaultValue={t?.crew ?? ""} className={input} /></F>
              <F label="Effectif prévu"><input name="plannedHeadcount" type="number" min={0} defaultValue={t?.plannedHeadcount ?? ""} className={input} /></F>
              <F label="Début prévu"><input name="plannedStart" type="date" defaultValue={fmtDate(t?.plannedStart)} className={input} /></F>
              <F label="Fin prévue"><input name="plannedEnd" type="date" defaultValue={fmtDate(t?.plannedEnd)} className={input} /></F>
              <F label="Unité"><input name="unit" defaultValue={t?.unit ?? "u"} className={input} /></F>
              <F label="Quantité prévue"><input name="qtyPlanned" type="number" step="any" min={0} defaultValue={t?.qtyPlanned ?? ""} className={input} /></F>
            </>
          ) : <p className="text-sm md:col-span-4">Tâche <b>{t?.code}</b> — {t?.title}</p>}
          <F label="Quantité réalisée"><input name="qtyDone" type="number" step="any" min={0} defaultValue={t?.qtyDone ?? ""} className={input} /></F>
          <F label="Avancement % (si pas de quantité)"><input name="manualProgress" type="number" min={0} max={100} defaultValue={t?.manualProgress ?? ""} className={input} /></F>
          <F label="Début réel"><input name="actualStart" type="date" defaultValue={fmtDate(t?.actualStart)} className={input} /></F>
          <F label="Fin réelle"><input name="actualEnd" type="date" defaultValue={fmtDate(t?.actualEnd)} className={input} /></F>
          <F label="Matériel / câble"><input name="material" defaultValue={t?.material ?? ""} className={input} /></F>
          <F label="Blocage / observation" wide><input name="note" defaultValue={t?.note ?? ""} className={input} /></F>
          <div className="flex gap-2 md:col-span-4">
            <button className={btn}>{t ? "Enregistrer" : "Créer la tâche"}</button>
            <Link href="/taches" className={btnLight}>Annuler</Link>
          </div>
        </form>
      )}
      {t && manager && (
        <form action={archiveTask}><input type="hidden" name="id" value={t.id} /><button className="text-sm text-red-600 underline">Archiver cette tâche</button></form>
      )}

      <form className="flex flex-wrap items-end gap-2">
        <select name="zone" defaultValue={sp.zone ?? ""} className={input}><option value="">Toutes zones</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.code}</option>)}</select>
        <select name="lot" defaultValue={sp.lot ?? ""} className={input}><option value="">CFO + CFA</option><option>CFO</option><option>CFA</option></select>
        <select name="status" defaultValue={sp.status ?? ""} className={input}><option value="">Tous statuts</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="late" value="1" defaultChecked={sp.late === "1"} />En retard</label>
        <button className={btnLight}>Filtrer</button>
      </form>

      {admin && total > 0 && (
        <div>
          <DeleteDialog
            action={deleteItemsByFilter}
            fields={{ ...active, kind: "TASK" }}
            className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-700"
            label={hasFilter ? `Supprimer les ${total} tâches filtrées` : `Supprimer toutes les tâches (${total})`}
            title="Suppression groupée"
            message={`${total} tâche(s) seront supprimées définitivement, avec leur historique et leurs blocages.`}
            phrase={hasFilter ? "SUPPRIMER" : "SUPPRIMER TOUT"}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{HEAD.map((h, k) => <th key={k} className={`${th} whitespace-nowrap`}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((i) => {
              const editable = canEdit(scope, i);
              return (
                <tr key={i.id} className={`border-t text-xs ${i.lot === "CFA" ? "bg-blue-50/60" : "bg-orange-50/60"}`}>
                  <td className={td}>{i.code}</td>
                  <td className={td}>{i.zone.code}</td>
                  <td className={td}><LotBadge lot={i.lot} /></td>
                  <td className={td}>{i.system?.name}</td>
                  <td className={`${td} min-w-48`}>{i.title}</td>
                  <td className={td}>{i.location}</td>
                  <td className={td}>{i.responsible ?? i.team?.leaderName ?? i.team?.leader?.name}</td>
                  <td className={td}>{i.crew}</td>
                  <td className={td}>{i.plannedHeadcount}</td>
                  <td className={td}>{fmtDate(i.plannedStart)}</td>
                  <td className={td}>{fmtDate(i.plannedEnd)}</td>
                  <td className={td}>{fmtDate(i.actualStart)}</td>
                  <td className={td}>{fmtDate(i.actualEnd)}</td>
                  <td className={td}><StatusBadge status={i.status} />{isLate(i.plannedEnd, i.status) && <b className="ml-1 text-red-600">RETARD</b>}</td>
                  <td className={`${td} w-36`}><Bar value={itemProgress(i)} lot={i.lot} /></td>
                  <td className={td}>{i.unit}</td>
                  <td className={td}><QtyCell itemId={i.id} field="qtyPlanned" value={i.qtyPlanned} editable={scope.all} /></td>
                  <td className={td}><QtyCell itemId={i.id} field="qtyDone" value={i.qtyDone} editable={editable} /></td>
                  <td className={`${td} tabular-nums`}>{reste(i.qtyPlanned, i.qtyDone) ?? "—"}</td>
                  <td className={td}>{i.material}</td>
                  <td className={`${td} min-w-40`}>{i.note}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtDate(i.lastUpdatedAt)}</td>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      {editable && <Link href={`/taches?edit=${i.id}`} className="underline">Modifier</Link>}
                      {admin && <DeleteDialog action={deleteWorkItem} fields={{ id: i.id }} label="Suppr." title="Supprimer cette tâche ?" message={`${i.code} — ${i.title}`} />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={23} className="p-6 text-center text-slate-500">Aucune tâche. Créez-en une ou importez le classeur A (menu Import).</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}