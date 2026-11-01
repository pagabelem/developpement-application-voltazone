import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/auth/permissions";
import { auditWhere } from "@/lib/filters";
import { deleteAllAudit, deleteAuditByFilter, deleteAuditEntry } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PageTitle, btn, btnLight, input, td, th } from "@/components/ui";

const PAGE = 100;
const KEYS = ["entity", "action", "userId", "from", "to"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (!isAdmin(user)) redirect("/dashboard");
  const page = Math.max(1, Number(sp.page) || 1);
  const where = auditWhere(sp);
  const active = Object.fromEntries(KEYS.filter((k) => sp[k]).map((k) => [k, sp[k] as string]));
  const hasFilter = Object.keys(active).length > 0;
  const [total, all, logs, entities, actions, users] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.count(),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: true } }),
    prisma.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
    prisma.auditLog.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } }),
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const link = (p: number) => `/audit?${new URLSearchParams({ ...active, page: String(p) })}`;
  const danger = "rounded border border-red-300 bg-white px-3 py-2 text-sm text-red-700 hover:bg-red-50";

  return (
    <div className="space-y-4">
      <PageTitle sub={`${all} entrée(s) au total — ${total} correspondant aux filtres`}>Journal d'audit</PageTitle>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-600">Entité
          <select name="entity" defaultValue={sp.entity ?? ""} className={input}><option value="">Toutes</option>{entities.map((e) => <option key={e.entity}>{e.entity}</option>)}</select></label>
        <label className="flex flex-col text-xs text-slate-600">Action
          <select name="action" defaultValue={sp.action ?? ""} className={input}><option value="">Toutes</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select></label>
        <label className="flex flex-col text-xs text-slate-600">Utilisateur
          <select name="userId" defaultValue={sp.userId ?? ""} className={input}><option value="">Tous</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="flex flex-col text-xs text-slate-600">Du<input type="date" name="from" defaultValue={sp.from ?? ""} className={input} /></label>
        <label className="flex flex-col text-xs text-slate-600">Au<input type="date" name="to" defaultValue={sp.to ?? ""} className={input} /></label>
        <button className={btn}>Filtrer</button>
        <Link href="/audit" className={btnLight}>Réinitialiser</Link>
      </form>

      <div className="flex flex-wrap gap-2">
        {hasFilter && total > 0 && (
          <DeleteDialog action={deleteAuditByFilter} fields={active} className={danger} label={`Supprimer les ${total} entrées filtrées`} title="Suppression par critères" message={`${total} entrée(s) correspondant aux filtres actuels seront supprimées définitivement.`} phrase="SUPPRIMER" />
        )}
        {all > 0 && (
          <DeleteDialog action={deleteAllAudit} fields={{}} className={danger} label={`Tout supprimer (${all})`} title="Supprimer tout le journal d'audit" message="Toutes les entrées du journal seront supprimées, quels que soient les filtres." phrase="SUPPRIMER TOUT" />
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{["Date", "Utilisateur", "Entité", "Action", "Avant", "Après", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className={`${td} whitespace-nowrap`}>{l.createdAt.toLocaleString("fr-FR")}</td>
                <td className={td}>{l.user?.name ?? "—"}</td>
                <td className={td}>{l.entity}</td>
                <td className={td}>{l.action}</td>
                <td className={`${td} max-w-xs break-words font-mono text-xs`}>{l.before ? JSON.stringify(l.before) : ""}</td>
                <td className={`${td} max-w-xs break-words font-mono text-xs`}>{l.after ? JSON.stringify(l.after) : ""}</td>
                <td className={td}>
                  <DeleteDialog action={deleteAuditEntry} fields={{ id: l.id }} label="Supprimer" title="Supprimer cette entrée ?" message={`${l.entity} · ${l.action} du ${l.createdAt.toLocaleString("fr-FR")}`} />
                </td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Aucune entrée.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 text-sm">
        {page > 1 && <Link className={btnLight} href={link(page - 1)}>← Précédent</Link>}
        {page * PAGE < total && <Link className={btnLight} href={link(page + 1)}>Suivant →</Link>}
      </div>
    </div>
  );
}