import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { isAdmin, isManager } from "@/lib/auth/permissions";
import { archiveTeam, saveTeam } from "@/lib/actions/admin";
import { deleteTeam } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { LotBadge, PageTitle, btn, card, fmtDate, input } from "@/components/ui";

type TeamLite = { id: string; name: string; lot: string; leaderId: string | null; leaderName: string | null; matricule: string | null; headcount: number; phone: string | null; startDate: Date | null; note: string | null; zones: { id: string }[] };

function TeamForm({ team, zones, leaders }: { team?: TeamLite; zones: { id: string; name: string }[]; leaders: { id: string; name: string }[] }) {
  const mine = new Set(team?.zones.map((z) => z.id));
  return (
    <form action={saveTeam} className="grid gap-2 md:grid-cols-3">
      {team && <input type="hidden" name="id" value={team.id} />}
      <input name="name" placeholder="Nom de l'équipe" required defaultValue={team?.name} className={input} />
      <select name="lot" defaultValue={team?.lot ?? "CFO"} className={input}><option>CFO</option><option>CFA</option></select>
      <input name="leaderName" placeholder="Nom du chef d'équipe" defaultValue={team?.leaderName ?? ""} className={input} />
      <select name="leaderId" defaultValue={team?.leaderId ?? ""} className={input}><option value="">— Compte utilisateur du chef (option) —</option>{leaders.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
      <input name="matricule" placeholder="Matricule / identifiant" defaultValue={team?.matricule ?? ""} className={input} />
      <label className="flex flex-col gap-1 text-xs text-slate-600">Effectif de l'équipe<input name="headcount" type="number" min={0} placeholder="Ex. 5" defaultValue={team?.headcount ?? 0} className={input} /></label>
      <label className="flex flex-col gap-1 text-xs text-slate-600">Date de début<input name="startDate" type="date" defaultValue={fmtDate(team?.startDate)} className={input} /></label>
      <input name="phone" placeholder="Téléphone / contact (option)" defaultValue={team?.phone ?? ""} className={input} />
      <input name="note" placeholder="Remarques" defaultValue={team?.note ?? ""} className={input} />
      <div className="flex flex-wrap gap-3 md:col-span-3">
        {zones.map((z) => <label key={z.id} className="flex items-center gap-1 text-sm"><input type="checkbox" name="zoneIds" value={z.id} defaultChecked={mine.has(z.id)} />{z.name}</label>)}
      </div>
      <div><button className={btn}>{team ? "Enregistrer" : "Créer l'équipe"}</button></div>
    </form>
  );
}

export default async function EquipesPage() {
  const user = await requireUser();
  if (!isManager(user)) redirect("/dashboard");
  const admin = isAdmin(user);
  const project = await currentProject();
  const [teams, zones, leaders] = await Promise.all([
    prisma.team.findMany({ where: { projectId: project.id, deletedAt: null }, include: { zones: { select: { id: true, name: true, code: true } }, leader: true }, orderBy: [{ lot: "asc" }, { name: "asc" }] }),
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.user.findMany({ where: { active: true, role: { in: ["CHEF_CFO", "CHEF_CFA"] } }, select: { id: true, name: true } }),
  ]);
  const gaps = (["CFO", "CFA"] as const)
    .map((lot) => {
      const cov = new Set(teams.filter((t) => t.lot === lot).flatMap((t) => t.zones.map((z) => z.id)));
      return { lot, missing: zones.filter((z) => !cov.has(z.id)).map((z) => z.code) };
    })
    .filter((g) => g.missing.length > 0);

  return (
    <div className="space-y-4">
      <PageTitle>Équipes</PageTitle>
      {gaps.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Zones sans équipe : {gaps.map((g) => `${g.lot} → ${g.missing.join(", ")}`).join(" · ")}
        </div>
      )}
      {teams.map((t) => (
        <details key={t.id} className={card}>
          <summary className="flex cursor-pointer flex-wrap items-center gap-3">
            <LotBadge lot={t.lot} /><b>{t.name}</b>
            <span className="text-sm text-slate-500">Chef : {t.leaderName ?? t.leader?.name ?? "—"} · {t.headcount} pers. · {t.zones.map((z) => z.code).join(", ") || "aucune zone"}</span>
          </summary>
          <div className="mt-3 space-y-2">
            <TeamForm team={t} zones={zones} leaders={leaders} />
            <div className="flex items-center gap-4">
              <form action={archiveTeam}><input type="hidden" name="id" value={t.id} /><button className="text-sm text-red-600 underline">Archiver l'équipe</button></form>
              {admin && <DeleteDialog action={deleteTeam} fields={{ id: t.id }} label="Supprimer définitivement" title="Supprimer cette équipe ?" message="Les lignes affectées à cette équipe resteront, mais sans équipe." />}
            </div>
          </div>
        </details>
      ))}
      <div className={card}><h2 className="mb-2 font-semibold">Nouvelle équipe</h2><TeamForm zones={zones} leaders={leaders} /></div>
    </div>
  );
}