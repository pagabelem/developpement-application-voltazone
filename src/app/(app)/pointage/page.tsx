import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin, isClient } from "@/lib/auth/permissions";
import { prefillTimesheet, saveTimesheet } from "@/lib/actions/rapports";
import { deleteTimesheetWeek } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { RowsEditor } from "@/components/rows-editor";
import { PageTitle, btn, btnLight, card, input } from "@/components/ui";
import { fr, isoDay, mondayOf, parseDay, projectLine } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const HK = ["h1", "h2", "h3", "h4", "h5", "h6"];

export default async function PointagePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (isClient(user)) redirect("/dashboard");
  const project = await currentProject();
  const write = canWrite(user), admin = isAdmin(user);
  const week = mondayOf(parseDay(sp.week) ?? new Date());
  const site = sp.site ?? "";
  const [entries, sites] = await Promise.all([
    prisma.timesheetEntry.findMany({ where: { projectId: project.id, weekStart: week, site }, orderBy: { name: "asc" } }),
    getRef(project.id, "BUILDING"),
  ]);
  const limit = project.overtimeAfter;
  const initial = entries.map((e) => ({ name: e.name, role: e.role, h1: e.h1, h2: e.h2, h3: e.h3, h4: e.h4, h5: e.h5, h6: e.h6, note: e.note }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub={`Heures supplémentaires au-delà de ${limit} h par semaine (réglable dans Paramètres)`}>Pointage hebdomadaire</PageTitle>
        <div className="flex gap-2"><a href={`/api/export/rapports?week=${isoDay(week)}&site=${encodeURIComponent(site)}`} className={btnLight}>Excel</a><PrintButton /></div>
      </div>
      <h2 className="hidden text-lg font-bold print:block">FEUILLE DE POINTAGE – ÉQUIPE COURANT FAIBLE — {projectLine(project)}</h2>

      <form className={`${card} flex flex-wrap items-end gap-2 print:hidden`}>
        <Field label="Semaine du (n'importe quel jour)"><input type="date" name="week" defaultValue={isoDay(week)} className={input} /></Field>
        <Field label="Chantier"><input name="site" list="sites" defaultValue={site} placeholder="Tous / à préciser" className={input} /><datalist id="sites">{sites.map((s) => <option key={s.id} value={s.label} />)}</datalist></Field>
        <button className={btnLight}>Afficher</button>
      </form>
      <p className="text-sm">Semaine du <b>{fr(week)}</b> {site && <>— chantier <b>{site}</b></>}</p>

      <form action={saveTimesheet} className={`${card} space-y-3`}>
        <input type="hidden" name="week" value={isoDay(week)} />
        <input type="hidden" name="site" value={site} />
        <RowsEditor
          key={`${isoDay(week)}|${site}|${entries.length}`}
          prefix="t" keyCol="name" minRows={5} addLabel="Ajouter une personne" footerLabel="TOTAL"
          columns={[
            { key: "name", label: "Nom & Prénom", w: "min-w-44" }, { key: "role", label: "Fonction", w: "min-w-32" },
            ...DAYS.map((d, i) => ({ key: HK[i], label: d, type: "number" as const, step: "0.5", min: 0, max: 24, w: "w-16" })),
            { key: "note", label: "Observation" },
          ]}
          computed={[
            { key: "total", label: "Total h", kind: "sum", from: HK },
            { key: "ot", label: "H. sup.", kind: "overtime", from: HK, limit },
          ]}
          footer={{ name: "count", h1: "sum", h2: "sum", h3: "sum", h4: "sum", h5: "sum", h6: "sum", total: "sum", ot: "sum" }}
          initial={initial}
        />
        <p className="text-xs text-slate-500">Les totaux et les heures supplémentaires se calculent en direct. Hypothèse : heures sup. = au-delà de {limit} h par semaine.</p>
        {write && <div className="print:hidden"><button className={btn}>Enregistrer la semaine</button></div>}
      </form>

      {write && (
        <div className="flex flex-wrap items-center gap-4 print:hidden">
          <form action={prefillTimesheet}>
            <input type="hidden" name="week" value={isoDay(week)} /><input type="hidden" name="site" value={site} />
            <button className={btnLight}>Pré-remplir depuis les rapports journaliers</button>
          </form>
          {admin && entries.length > 0 && <DeleteDialog action={deleteTimesheetWeek} fields={{ week: isoDay(week), site }} label="Supprimer cette semaine" title="Supprimer le pointage de la semaine ?" message={`${entries.length} ligne(s) du pointage de la semaine du ${fr(week)} seront supprimées.`} />}
        </div>
      )}
    </div>
  );
}