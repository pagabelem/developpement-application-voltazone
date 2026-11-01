import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { getEditScope, isManager } from "@/lib/auth/permissions";
import { aggregate } from "@/lib/domain/calc";
import { archiveZone, upsertZone } from "@/lib/actions/admin";
import { saveHeadcount } from "@/lib/actions/tasks";
import { Bar, PageTitle, StatusBadge, btn, btnLight, card, input } from "@/components/ui";
import { isAdmin } from "@/lib/auth/permissions";   // à ajouter à l'import existant de permissions
import { DeleteDialog } from "@/components/delete-dialog";
import { deleteWorkItem , deleteIssue, deleteZone, deleteTeam, deleteItemsByFilter  } from "@/lib/actions/delete";



type Z = { id: string; code: string; name: string; building: string | null; order: number; mainLot: string; leaderName: string | null; plannedHeadcount: number | null; note: string | null };

const L = ({ label, hint, wide, children }: { label: string; hint?: string; wide?: boolean; children: React.ReactNode }) => (
  <label className={`flex flex-col gap-1 text-xs text-slate-600 ${wide ? "md:col-span-2" : ""}`}>
    {label}{children}{hint && <span className="text-[11px] text-slate-400">{hint}</span>}
  </label>
);



function ZoneForm({ z, next }: { z?: Z; next?: number }) {
  return (
    <form action={upsertZone} className="grid gap-3 md:grid-cols-4">
      {z && <input type="hidden" name="id" value={z.id} />}
      <L label="Code" hint="Vide = code suivant automatique (Z11, Z12…)"><input name="code" placeholder="Auto" defaultValue={z?.code} className={input} /></L>
      <L label="Nom de la zone / secteur" wide><input name="name" required placeholder="Ex. Tribune Nord" defaultValue={z?.name} className={input} /></L>
      <L label="Ordre d'affichage" hint="Position dans les listes (1 = en premier)"><input name="order" type="number" min={0} defaultValue={z?.order ?? next} className={input} /></L>
      <L label="Bâtiment / niveau"><input name="building" placeholder="Ex. Bloc A" defaultValue={z?.building ?? ""} className={input} /></L>
      <L label="Lot principal"><select name="mainLot" defaultValue={z?.mainLot ?? "CFO/CFA"} className={input}><option>CFO/CFA</option><option>CFO</option><option>CFA</option></select></L>
      <L label="Responsable"><input name="leaderName" placeholder="Nom du responsable" defaultValue={z?.leaderName ?? ""} className={input} /></L>
      <L label="Effectif prévu (de départ)" hint="Nombre de personnes prévues sur la zone"><input name="plannedHeadcount" type="number" min={0} placeholder="Ex. 12" defaultValue={z?.plannedHeadcount ?? ""} className={input} /></L>
      <L label="Observations" wide><input name="note" placeholder="Remarque libre" defaultValue={z?.note ?? ""} className={input} /></L>
      <div className="flex items-end"><button className={btn}>{z ? "Enregistrer" : "Ajouter la zone"}</button></div>
    </form>
  );
}

export default async function ZonesPage() {
  const user = await requireUser();
  const admin = isAdmin(user);

  const project = await currentProject();
  const manager = isManager(user);
  const scope = await getEditScope(user);
  const m = project.aggregation;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const [zones, items, heads] = await Promise.all([
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" }, include: { teams: { where: { deletedAt: null }, select: { id: true, lot: true, name: true } } } }),
    prisma.workItem.findMany({ where: { projectId: project.id, deletedAt: null }, select: { zoneId: true, lot: true, status: true, qtyPlanned: true, qtyDone: true, manualProgress: true, weight: true, unit: true } }),
    prisma.zoneHeadcount.findMany({ where: { date: today, zone: { projectId: project.id } } }),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle sub="Avancement et statut calculés automatiquement ; renommer une zone se répercute partout">Zones</PageTitle>
      {zones.map((z) => {
        const zi = items.filter((i) => i.zoneId === z.id);
        const global = aggregate(zi, m);
        const status = zi.some((i) => i.status === "BLOQUE") ? "BLOQUE" : global == null ? "NON_RENSEIGNE" : global >= 1 ? "TERMINE" : global > 0 ? "EN_COURS" : "A_FAIRE";
        const head = heads.find((h) => h.zoneId === z.id);
        const canHead = scope.all || scope.zones.has(z.id);
        return (
          <div key={z.id} className={`${card} space-y-3`}>
            <div className="flex flex-wrap items-center gap-3">
              <b>{z.code}</b><span className="font-medium">{z.name}</span><StatusBadge status={status} />
              <span className="text-xs text-slate-500">{z.building ?? "—"} · lot {z.mainLot} · resp. {z.leaderName ?? "—"}</span>
              <Link href={`/suivi?zone=${z.id}`} className="ml-auto text-sm underline">Voir le suivi</Link>
            </div>
            <div className="grid items-center gap-3 md:grid-cols-4">
              <div><div className="text-xs text-orange-600">CFO</div><Bar lot="CFO" value={aggregate(zi.filter((i) => i.lot === "CFO"), m)} /></div>
              <div><div className="text-xs text-blue-600">CFA</div><Bar lot="CFA" value={aggregate(zi.filter((i) => i.lot === "CFA"), m)} /></div>
              <div><div className="text-xs text-slate-500">Global</div><Bar value={global} /></div>
              <div className="text-sm">
                <div className="text-xs text-slate-500">Effectif prévu : {z.plannedHeadcount ?? "—"}</div>
                {canHead ? (
                  <form action={saveHeadcount} className="flex items-center gap-1">
                    <input type="hidden" name="zoneId" value={z.id} />
                    <input type="hidden" name="planned" value={z.plannedHeadcount ?? ""} />
                    <input name="present" type="number" min={0} defaultValue={head?.present ?? ""} placeholder="Présent aujourd'hui" required className={`${input} w-24`} />
                    <button className={btnLight}>OK</button>
                  </form>
                ) : <div>Présent aujourd'hui : {head?.present ?? "—"}</div>}
              </div>
            </div>
            <p className="text-xs text-slate-500">Équipes : {z.teams.map((t) => `${t.lot} ${t.name}`).join(" · ") || "aucune"}{z.note ? ` — ${z.note}` : ""}</p>
            {manager && (
              <details>
                <summary className="cursor-pointer text-sm underline">Modifier la zone</summary>
                <div className="mt-2 space-y-2">
                  <ZoneForm z={z} />
                  <form action={archiveZone}><input type="hidden" name="id" value={z.id} /><button className="text-sm text-red-600 underline">Archiver la zone</button></form>
                  {admin && <DeleteDialog action={deleteZone} fields={{ id: z.id }} label="Supprimer définitivement" title={`Supprimer la zone ${z.code} ?`} message={`La zone et ses ${zi.length} ligne(s) / tâche(s) seront supprimées définitivement.`} phrase={z.code} />}
                </div>
              </details>
            )}
          </div>
        );
      })}
      {manager && <div className={card}><h2 className="mb-2 font-semibold">Nouvelle zone</h2><ZoneForm next={zones.length + 1} /></div>}
    </div>
  );
}