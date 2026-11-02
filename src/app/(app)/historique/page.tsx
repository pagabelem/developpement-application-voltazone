import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin } from "@/lib/auth/permissions";
import { savePeriod } from "@/lib/actions/rapports";
import { deletePeriod } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { PageTitle, btn, btnLight, card, input, td, th } from "@/components/ui";
import {  fr, isoDay, mergedDays, projectLine } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";

const days = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000) + 1;

export default async function HistoriquePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const project = await currentProject();
  const write = canWrite(user), admin = isAdmin(user);
  const [list, editing] = await Promise.all([
    prisma.periodLog.findMany({ where: { projectId: project.id }, orderBy: [{ startDate: "desc" }, { endDate: "desc" }], take: 500 }),
    sp.edit ? prisma.periodLog.findUnique({ where: { id: sp.edit } }) : null,
  ]);
  const sumDays = list.reduce((s, p) => s + days(p.startDate, p.endDate), 0);
  const covered = mergedDays(list.map((p) => ({ start: p.startDate, end: p.endDate })));
  const e = editing;


  const workTypes = (await getRef(project.id, "WORK_TYPE")).map((w) => w.label);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub="Une ligne = une période (du … au …) pour un type de travaux et une zone">Historique par période</PageTitle>
        <PrintButton />
      </div>
      <h2 className="hidden text-lg font-bold print:block">HISTORIQUE DES TRAVAUX PAR PÉRIODE — {projectLine(project)}</h2>

      {write && (
        <details className={`${card} print:hidden`} open={!!e || sp.new === "1"}>
          <summary className="cursor-pointer font-semibold">{e ? "Modifier la période" : "+ Nouvelle période"}</summary>
          <form action={savePeriod} className="mt-3 grid gap-3 md:grid-cols-4">
            {e && <input type="hidden" name="id" value={e.id} />}
            <Field label="Du"><input type="date" name="start" required defaultValue={isoDay(e?.startDate)} className={input} /></Field>
            <Field label="Au"><input type="date" name="end" required defaultValue={isoDay(e?.endDate)} className={input} /></Field>
            <Field label="Type de travaux"><select name="workType" required defaultValue={e?.workType ?? ""} className={input}><option value="">—</option>{workTypes.map((w) => <option key={w}>{w}</option>)}</select></Field>
            <Field label="Zone"><input name="zoneLabel" defaultValue={e?.zoneLabel ?? ""} className={input} /></Field>
            <Field label="Système"><input name="system" defaultValue={e?.system ?? ""} className={input} /></Field>
            <Field label="Avancement (%)"><input name="percent" type="number" min={0} max={100} defaultValue={e?.percent ?? ""} className={input} /></Field>
            <Field label="Travaux réalisés" wide><input name="work" required defaultValue={e?.work ?? ""} className={input} /></Field>
            <Field label="Observation" wide><input name="note" defaultValue={e?.note ?? ""} className={input} /></Field>
            <div className="flex gap-2"><button className={btn}>{e ? "Enregistrer" : "Ajouter"}</button>{e && <Link href="/historique" className={btnLight}>Annuler</Link>}</div>
          </form>
        </details>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{["Du", "Au", "Durée (j)", "Type de travaux", "Zone", "Système", "Travaux réalisés", "Avanc.", "Observation", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t text-sm">
                <td className={td}>{fr(p.startDate)}</td><td className={td}>{fr(p.endDate)}</td><td className={`${td} tabular-nums`}>{days(p.startDate, p.endDate)}</td>
                <td className={td}>{p.workType}</td><td className={td}>{p.zoneLabel}</td><td className={td}>{p.system}</td><td className={`${td} min-w-56`}>{p.work}</td>
                <td className={td}>{p.percent == null ? "" : `${Math.round(p.percent)} %`}</td><td className={td}>{p.note}</td>
                <td className={`${td} print:hidden`}><div className="flex items-center gap-3">
                  {write && <Link href={`/historique?edit=${p.id}`} className="underline">Modifier</Link>}
                  {admin && <DeleteDialog action={deletePeriod} fields={{ id: p.id }} label="Suppr." title="Supprimer cette période ?" message={`${fr(p.startDate)} → ${fr(p.endDate)} : ${p.work}`} />}
                </div></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={10} className="p-6 text-center text-slate-500">Aucune période enregistrée.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={`${card} flex flex-wrap gap-6 text-sm`}>
        <span>Total jours (somme des durées) : <b>{sumDays}</b></span>
        <span>Jours calendaires couverts (sans doublon) : <b>{covered}</b></span>
      </div>
    </div>
  );
}