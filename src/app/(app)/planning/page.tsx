import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEdit, getEditScope, isAdmin } from "@/lib/auth/permissions";
import { daysPlanned, isLate, itemProgress } from "@/lib/domain/calc";
import { updateDates } from "@/lib/actions/suivi";
import { deleteWorkItem } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { Bar, LotBadge, PageTitle, StatusBadge, btnLight, fmtDate, input, td, th } from "@/components/ui";

const PAGE = 60;

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const project = await currentProject();
  const scope = await getEditScope(user);
  const page = Math.max(1, Number(sp.page) || 1);
  const where: Prisma.WorkItemWhereInput = {
    projectId: project.id,
    deletedAt: null,
    kind: "TASK",
    ...(sp.lot === "CFO" || sp.lot === "CFA" ? { lot: sp.lot } : {}),
    ...(sp.only === "dated" ? { OR: [{ plannedStart: { not: null } }, { plannedEnd: { not: null } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.workItem.count({ where }),
    prisma.workItem.findMany({ where, include: { zone: true, team: { include: { leader: true } } }, orderBy: [{ plannedEnd: { sort: "asc", nulls: "last" } }, { code: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
  ]);

  const stamps = items.flatMap((i) => [i.plannedStart?.getTime(), i.plannedEnd?.getTime()]).filter((x): x is number => x != null);
  const min = stamps.length ? Math.min(...stamps) : 0;
  const span = stamps.length ? Math.max(1, Math.max(...stamps) - min) : 1;
  const link = (p: number) => `/planning?page=${p}&lot=${sp.lot ?? ""}&only=${sp.only ?? ""}`;

  return (
    <div>
      <PageTitle sub={`${total} tâche(s) — retards en rouge, « Jours » = fin − début + 1`}>Planning</PageTitle>
      <form className="mb-3 flex gap-2">
        <select name="lot" defaultValue={sp.lot ?? ""} className={input}><option value="">CFO + CFA</option><option>CFO</option><option>CFA</option></select>
        <select name="only" defaultValue={sp.only ?? ""} className={input}><option value="">Toutes les tâches</option><option value="dated">Avec dates seulement</option></select>
        <button className={btnLight}>Filtrer</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{["ID", "Zone", "Lot", "Tâche", "Responsable", "Dates prévues", "Jours", "Gantt", "Statut", "Avancement", "Remarques", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {items.map((i) => {
              const late = isLate(i.plannedEnd, i.status);
              const editable = canEdit(scope, i);
              const s = i.plannedStart?.getTime() ?? i.plannedEnd?.getTime();
              const e = i.plannedEnd?.getTime() ?? i.plannedStart?.getTime();
              return (
                <tr key={i.id} className={`border-t text-xs ${late ? "bg-red-50" : ""}`}>
                  <td className={td}>{i.code}</td><td className={td}>{i.zone.code}</td><td className={td}><LotBadge lot={i.lot} /></td>
                  <td className={`${td} min-w-48`}>{i.title}</td>
                  <td className={td}>{i.responsible ?? i.team?.leaderName ?? i.team?.leader?.name}</td>
                  <td className={td}>
                    {editable ? (
                      <form action={updateDates} className="flex items-center gap-1">
                        <input type="hidden" name="itemId" value={i.id} />
                        <input type="date" name="plannedStart" defaultValue={fmtDate(i.plannedStart)} className={input} />
                        <input type="date" name="plannedEnd" defaultValue={fmtDate(i.plannedEnd)} className={input} />
                        <button className={btnLight}>OK</button>
                      </form>
                    ) : `${fmtDate(i.plannedStart)} → ${fmtDate(i.plannedEnd)}`}
                  </td>
                  <td className={`${td} tabular-nums`}>{daysPlanned(i.plannedStart, i.plannedEnd) ?? ""}</td>
                  <td className={`${td} w-48`}>
                    {s != null && e != null && (
                      <div className="relative h-3 rounded bg-slate-100">
                        <div className={`absolute h-3 rounded ${late ? "bg-red-500" : "bg-blue-500"}`} style={{ left: `${((s - min) / span) * 100}%`, width: `${Math.max(2, ((e - s) / span) * 100)}%` }} />
                      </div>
                    )}
                  </td>
                  <td className={td}><StatusBadge status={i.status} />{late && <b className="ml-1 text-red-600">RETARD</b>}</td>
                  <td className={`${td} w-32`}><Bar value={itemProgress(i)} lot={i.lot} /></td>
                  <td className={td}>{i.note}</td>
                  <td className={td}>
                    {admin && <DeleteDialog action={deleteWorkItem} fields={{ id: i.id }} label="Suppr." title="Supprimer cette tâche ?" message={`${i.code} — ${i.title}`} />}
                  </td>
                </tr>
              );
            })}
            {items.length === 0 && <tr><td colSpan={12} className="p-6 text-center text-slate-500">Aucune tâche. Importez le classeur A ou créez des tâches.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        {page > 1 && <Link className={btnLight} href={link(page - 1)}>← Précédent</Link>}
        {page * PAGE < total && <Link className={btnLight} href={link(page + 1)}>Suivant →</Link>}
      </div>
    </div>
  );
}