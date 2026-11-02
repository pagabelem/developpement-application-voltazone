import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin, isManager } from "@/lib/auth/permissions";
import { saveDailyReport, signReport } from "@/lib/actions/rapports";
import { deleteDailyReport } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { RowsEditor } from "@/components/rows-editor";
import { Attachments } from "@/components/attachments";
import { PageTitle, btn, btnLight, card, input, td, th } from "@/components/ui";
import { fr, isoDay, mean, parseDay, projectLine, totalPct, utcDay } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";

type Sys = { system: string; previousPct: number; todayPct: number; work: string | null };

export default async function RapportJourPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const project = await currentProject();
  const write = canWrite(user), manager = isManager(user), admin = isAdmin(user);
  const [reports, sites, refSystems] = await Promise.all([
    prisma.dailyReport.findMany({ where: { projectId: project.id }, orderBy: [{ date: "desc" }, { site: "asc" }], take: 40, include: { workers: true, systems: true } }),
    getRef(project.id, "BUILDING"),
    getRef(project.id, "REPORT_SYSTEM"),
  ]);
  const current = sp.id ? await prisma.dailyReport.findUnique({ where: { id: sp.id }, include: { workers: true, systems: true } }) : null;
  const creating = write && !current && sp.new === "1";
  const newDate = parseDay(sp.date) ?? utcDay();
  const newSite = sp.site ?? "";
  // Pré-remplissage : équipe et avancement « veille » repris du dernier rapport du même chantier
  const prev = creating && newSite ? await prisma.dailyReport.findFirst({ where: { projectId: project.id, site: newSite, date: { lt: newDate } }, orderBy: { date: "desc" }, include: { systems: true, workers: true } }) : null;
  const sysDefaults: Sys[] = prev
    ? prev.systems.map((s) => ({ system: s.system, previousPct: totalPct(s.previousPct, s.todayPct), todayPct: 0, work: null }))
    : refSystems.map((s) => ({ system: s.label, previousPct: 0, todayPct: 0, work: null }));
  const workers = current ? current.workers.map((w) => ({ name: w.name, role: w.role, hours: w.hours, note: w.note })) : (prev?.workers ?? []).map((w) => ({ name: w.name, role: w.role, hours: null as number | null, note: null as string | null }));
  const systems = (current ? current.systems : sysDefaults).map((s) => ({ system: s.system, previousPct: s.previousPct, todayPct: s.todayPct, work: s.work }));
  const f = {
    date: current?.date ?? newDate, site: current?.site ?? newSite, zoneLabel: current?.zoneLabel ?? "",
    leaderName: current?.leaderName ?? (user.role.startsWith("CHEF") ? user.name : ""), weather: current?.weather ?? "",
    issuesText: current?.issuesText ?? "", materialText: current?.materialText ?? "", safetyText: current?.safetyText ?? "", tomorrowText: current?.tomorrowText ?? "",
  };
  const area = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub="Effectif, avancement par système, sécurité et visas — imprimable en PDF">Rapports journaliers</PageTitle>
        {current && <div className="flex gap-2"><a href={`/api/export/rapports?report=${current.id}`} className={btnLight}>Excel</a><PrintButton /></div>}
      </div>

      {write && (
        <form className={`${card} flex flex-wrap items-end gap-2 print:hidden`}>
          <input type="hidden" name="new" value="1" />
          <Field label="Date"><input type="date" name="date" defaultValue={isoDay(newDate)} className={input} /></Field>
          <Field label="Chantier / bâtiment"><select name="site" defaultValue={newSite} required className={input}><option value="">—</option>{sites.map((s) => <option key={s.id}>{s.label}</option>)}</select></Field>
          <button className={btn}>Nouveau rapport</button>
        </form>
      )}

      {(current || creating) && (
        <>
          <h2 className="hidden text-lg font-bold print:block">RAPPORT JOURNALIER DE CHANTIER – COURANT FAIBLE — {projectLine(project)}</h2>
          <form action={saveDailyReport} className={`${card} space-y-4`}>
            {current && <input type="hidden" name="id" value={current.id} />}
            <div className="grid gap-3 md:grid-cols-4">
              <Field label="Date"><input name="date" type="date" required defaultValue={isoDay(f.date)} className={input} /></Field>
              <Field label="Chantier / bâtiment"><input name="site" list="sites" required defaultValue={f.site} className={input} /><datalist id="sites">{sites.map((s) => <option key={s.id} value={s.label} />)}</datalist></Field>
              <Field label="Zone / étage"><input name="zoneLabel" placeholder="Ex. R+1" defaultValue={f.zoneLabel} className={input} /></Field>
              <Field label="Chef d'équipe"><input name="leaderName" defaultValue={f.leaderName} className={input} /></Field>
              <Field label="Météo"><input name="weather" placeholder="Ex. Ensoleillé" defaultValue={f.weather} className={input} /></Field>
            </div>

            <h3 className="font-semibold">Effectif présent</h3>
            <RowsEditor
              prefix="w" keyCol="name" minRows={4} addLabel="Ajouter une personne" footerLabel="Effectif total" footer={{ name: "count", hours: "sum" }}
              columns={[{ key: "name", label: "Nom" }, { key: "role", label: "Fonction" }, { key: "hours", label: "Heures", type: "number", step: "0.5", min: 0, max: 24, w: "w-24" }, { key: "note", label: "Observation" }]}
              initial={workers}
            />

            <h3 className="font-semibold">Travaux réalisés par système</h3>
            <RowsEditor
              prefix="s" keyCol="system" minRows={3} addLabel="Ajouter un système" footerLabel="Avancement global (moyenne)" footer={{ total: "avg" }}
              columns={[
                { key: "system", label: "Système" },
                { key: "previousPct", label: "Veille (%)", type: "number", min: 0, max: 100, w: "w-24" },
                { key: "todayPct", label: "Aujourd'hui (%)", type: "number", min: 0, max: 100, w: "w-24" },
                { key: "work", label: "Travaux réalisés" },
              ]}
              computed={[{ key: "total", label: "Total (%)", kind: "capSum", from: ["previousPct", "todayPct"], max: 100, suffix: " %" }]}
              initial={systems}
            />
            <p className="text-xs text-slate-500">Total = veille + aujourd'hui, plafonné à 100 % (calculé en direct).</p>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Problèmes / interférences avec les autres corps d'état"><textarea name="issuesText" rows={3} defaultValue={f.issuesText} className={area} /></Field>
              <Field label="Matériel reçu / manquant / demandé"><textarea name="materialText" rows={3} defaultValue={f.materialText} className={area} /></Field>
              <Field label="Points sécurité (accidents, quasi-accidents, causerie)"><textarea name="safetyText" rows={3} defaultValue={f.safetyText} className={area} /></Field>
              <Field label="Travaux prévus demain"><textarea name="tomorrowText" rows={3} defaultValue={f.tomorrowText} className={area} /></Field>
            </div>
            <div className="print:hidden"><button className={btn}>{current ? "Enregistrer le rapport" : "Créer le rapport"}</button></div>
          </form>

          {current && (
            <>
              <div className={card}><div className="mb-2 text-sm font-semibold">Photos et pièces jointes</div><Attachments entity="DAILY_REPORT" entityId={current.id} canUpload={write} admin={admin} /></div>
              <div className="grid gap-3 md:grid-cols-2">
                {(["leader", "manager"] as const).map((who) => {
                  const by = who === "leader" ? current.leaderVisaBy : current.managerVisaBy;
                  const at = who === "leader" ? current.leaderVisaAt : current.managerVisaAt;
                  const can = who === "leader" ? write : manager;
                  return (
                    <div key={who} className={card}>
                      <div className="text-xs text-slate-500">Visa {who === "leader" ? "chef d'équipe" : "conducteur de travaux"}</div>
                      {at ? <div className="font-medium">{by} — {at.toLocaleString("fr-FR")}</div>
                        : can ? <form action={signReport}><input type="hidden" name="id" value={current.id} /><input type="hidden" name="who" value={who} /><button className={`${btn} mt-1 print:hidden`}>Apposer mon visa</button></form>
                        : <div className="text-slate-400">En attente</div>}
                    </div>
                  );
                })}
              </div>
              {admin && <div className="print:hidden"><DeleteDialog action={deleteDailyReport} fields={{ id: current.id }} label="Supprimer ce rapport" title="Supprimer ce rapport ?" message={`${current.site} du ${fr(current.date)}`} /></div>}
            </>
          )}
        </>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white print:hidden">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{["Date", "Chantier", "Chef d'équipe", "Effectif", "Heures", "Avancement", "Visas", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {reports.map((r) => {
              const g = mean(r.systems.map((s) => totalPct(s.previousPct, s.todayPct)));
              return (
                <tr key={r.id} className="border-t text-sm">
                  <td className={td}>{fr(r.date)}</td><td className={td}>{r.site}</td><td className={td}>{r.leaderName}</td>
                  <td className={td}>{r.workers.length}</td><td className={td}>{r.workers.reduce((s, w) => s + (w.hours ?? 0), 0)} h</td>
                  <td className={td}>{g == null ? "—" : `${Math.round(g)} %`}</td>
                  <td className={td}>{r.leaderVisaAt ? "✓ chef" : "—"} · {r.managerVisaAt ? "✓ conducteur" : "—"}</td>
                  <td className={td}><Link href={`/rapport-jour?id=${r.id}`} className="underline">Ouvrir</Link></td>
                </tr>
              );
            })}
            {reports.length === 0 && <tr><td colSpan={8} className="p-6 text-center text-slate-500">Aucun rapport. Choisissez une date et un chantier, puis « Nouveau rapport ».</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}