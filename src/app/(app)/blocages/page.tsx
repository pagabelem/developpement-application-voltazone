import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEdit, getEditScope } from "@/lib/auth/permissions";
import { createIssue, resolveIssue } from "@/lib/actions/suivi";
import { LotBadge, PageTitle, btn, card, input } from "@/components/ui";
import { isAdmin } from "@/lib/auth/permissions";   // à ajouter à l'import existant de permissions
import { DeleteDialog } from "@/components/delete-dialog";
import { deleteWorkItem , deleteIssue, deleteZone, deleteTeam, deleteItemsByFilter  } from "@/lib/actions/delete";


export default async function BlocagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const admin = isAdmin(user);
  const project = await currentProject();
  const scope = await getEditScope(user);
  const [issues, target] = await Promise.all([
    prisma.issue.findMany({
      where: { workItem: { projectId: project.id } },
      include: { workItem: { include: { zone: true, level: true, system: true } }, openedBy: true },
      orderBy: [{ status: "asc" }, { openedAt: "desc" }],
      take: 200,
    }),
    sp.new ? prisma.workItem.findUnique({ where: { id: sp.new }, include: { zone: true, level: true, system: true } }) : null,
  ]);

  return (
    <div className="space-y-4">
      <PageTitle>Blocages</PageTitle>

      {target && canEdit(scope, target) && (
        <form action={createIssue} className={`${card} space-y-2 border-red-300`}>
          <h2 className="font-semibold">Déclarer un blocage : {target.zone.name} · {target.level?.label} · {target.system?.name}</h2>
          <input type="hidden" name="itemId" value={target.id} />
          <textarea name="description" required minLength={3} rows={3} placeholder="Motif du blocage" className={`${input} w-full`} />
          <button className={btn}>Déclarer</button>
        </form>
      )}

      <div className="space-y-2">
        {issues.map((i) => (
          <div key={i.id} className={`${card} ${i.status === "OUVERT" ? "border-l-4 border-l-red-500" : "opacity-70"}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <LotBadge lot={i.workItem.lot} />
              <b>{i.workItem.zone.name} · {i.workItem.level?.label} · {i.workItem.system?.name}</b>
              <span className="text-slate-500">ouvert le {i.openedAt.toLocaleDateString("fr-FR")} par {i.openedBy.name}</span>
              <span className={i.status === "OUVERT" ? "font-semibold text-red-600" : "text-green-700"}>{i.status === "OUVERT" ? "OUVERT" : "RÉSOLU"}</span>
            </div>
            <p className="mt-1">{i.description}</p>
            {i.resolution && <p className="text-sm text-slate-500">Résolution : {i.resolution}</p>}
            {i.status === "OUVERT" && canEdit(scope, i.workItem) && (
              <form action={resolveIssue} className="mt-2 flex gap-2">
                <input type="hidden" name="issueId" value={i.id} />
                <input name="resolution" placeholder="Résolution (option)" className={`${input} flex-1`} />
                <button className={btn}>Clôturer</button>
              </form>
            )}

{admin && <div className="mt-2"><DeleteDialog action={deleteIssue} fields={{ id: i.id }} label="Supprimer ce blocage" title="Supprimer ce blocage ?" message="Le statut de la ligne concernée sera recalculé." /></div>}

          </div>
        ))}
        {issues.length === 0 && <p className="text-slate-500">Aucun blocage.</p>}
      </div>
    </div>
  );
}