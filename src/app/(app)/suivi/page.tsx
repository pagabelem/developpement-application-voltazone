import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEdit, getEditScope, isAdmin } from "@/lib/auth/permissions";
import { buildWhere } from "@/lib/filters";
import { ecart, rowProgress, STATUS_LABEL } from "@/lib/domain/calc";
import { deleteItemsByFilter, deleteWorkItem } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { Bar, LotBadge, PageTitle, StatusBadge, btn, btnLight, input, td, th } from "@/components/ui";
import { QtyCell } from "@/components/qty-cell";

const PAGE = 100;

export default async function SuiviPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const project = await currentProject();
  const page = Math.max(1, Number(sp.page) || 1);
  const where = buildWhere(project.id, { ...sp, kind: "GRID" });
  const active = Object.fromEntries(["zone", "level", "lot", "status", "late"].filter((k) => sp[k]).map((k) => [k, sp[k] as string]));
  const hasFilter = Object.keys(active).length > 0;

  const [total, items, zones, levels, scope] = await Promise.all([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({
      where,
      include: { zone: true, level: true, system: true },
      orderBy: [{ zone: { order: "asc" } }, { level: { order: "asc" } }, { lot: "asc" }, { system: { order: "asc" } }],
      skip: (page - 1) * PAGE,
      take: PAGE,
    }),
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" } }),
    prisma.level.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } }),
    getEditScope(user),
  ]);

  const qs = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "page") q.set(k, v);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return q.toString();
  };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div>
      <PageTitle sub={`${total} ligne(s) — cases jaunes = saisie, enregistrement automatique`}>Suivi des travaux</PageTitle>

      <form className="mb-3 flex flex-wrap items-end gap-2">
        <select name="zone" defaultValue={sp.zone ?? ""} className={input}><option value="">Toutes zones</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select>
        <select name="level" defaultValue={sp.level ?? ""} className={input}><option value="">Tous niveaux</option>{levels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
        <select name="lot" defaultValue={sp.lot ?? ""} className={input}><option value="">CFO + CFA</option><option value="CFO">CFO</option><option value="CFA">CFA</option></select>
        <select name="status" defaultValue={sp.status ?? ""} className={input}><option value="">Tous statuts</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="late" value="1" defaultChecked={sp.late === "1"} />En retard</label>
        <button className={btn}>Filtrer</button>
        <Link href="/suivi" className={btnLight}>Réinitialiser</Link>
        <a href={`/api/export/suivi?${qs({ format: "xlsx", kind: "GRID" })}`} className={btnLight}>Excel</a>
        <a href={`/api/export/suivi?${qs({ format: "csv", kind: "GRID" })}`} className={btnLight}>CSV</a>
      </form>

      {admin && total > 0 && (
        <div className="mb-3">
          <DeleteDialog
            action={deleteItemsByFilter}
            fields={{ ...active, kind: "GRID" }}
            className="rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-700"
            label={hasFilter ? `Supprimer les ${total} lignes filtrées` : `Supprimer toutes les lignes (${total})`}
            title="Suppression groupée"
            message={`${total} ligne(s) de la grille seront supprimées définitivement, avec leur historique et leurs blocages.`}
            phrase={hasFilter ? "SUPPRIMER" : "SUPPRIMER TOUT"}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>{["Zone", "Étage", "Lot", "Système", "Sur plan", "Sur site", "Écart", "Avancement", "Statut", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const editable = canEdit(scope, i);
              const e = ecart(i.qtyPlanned, i.qtyDone);
              return (
                <tr key={i.id} className={`border-t ${i.lot === "CFA" ? "bg-blue-50/60" : "bg-orange-50/60"}`}>
                  <td className={td}>{i.zone.name}</td>
                  <td className={td}>{i.level?.label}</td>
                  <td className={td}><LotBadge lot={i.lot} /></td>
                  <td className={td}>{i.system?.name ?? i.title}</td>
                  <td className={td}><QtyCell itemId={i.id} field="qtyPlanned" value={i.qtyPlanned} editable={scope.all} /></td>
                  <td className={td}><QtyCell itemId={i.id} field="qtyDone" value={i.qtyDone} editable={editable} /></td>
                  <td className={`${td} tabular-nums`}>
                    {e ?? "—"}
                    {i.qtyPlanned != null && i.qtyDone != null && i.qtyDone > i.qtyPlanned && <span title="Dépassement de la quantité prévue (RG-08)" className="ml-1 text-amber-600">⚠</span>}
                  </td>
                  <td className={`${td} w-40`}><Bar value={rowProgress(i.qtyPlanned, i.qtyDone)} lot={i.lot} /></td>
                  <td className={td}><StatusBadge status={i.status} /></td>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      {editable && <Link href={`/blocages?new=${i.id}`} className="text-xs text-red-600 hover:underline">Bloquer</Link>}
                      {admin && (
                        <DeleteDialog action={deleteWorkItem} fields={{ id: i.id }} label="Suppr." title="Supprimer cette ligne ?" message={`${i.zone.name} · ${i.level?.label} · ${i.system?.name} : suppression définitive (historique et blocages inclus).`} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">Aucune ligne. Générez la grille dans Paramètres.</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          {page > 1 && <Link href={`/suivi?${qs({ page: String(page - 1) })}`} className={btnLight}>← Précédent</Link>}
          <span>Page {page} / {pages}</span>
          {page < pages && <Link href={`/suivi?${qs({ page: String(page + 1) })}`} className={btnLight}>Suivant →</Link>}
        </div>
      )}
    </div>
  );
}