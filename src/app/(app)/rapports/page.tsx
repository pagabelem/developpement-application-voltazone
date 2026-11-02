import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { aggregate } from "@/lib/domain/calc";
import { PrintButton } from "@/components/print-button";
import { PageTitle, btnLight, pct, td, th , btn, card, input } from "@/components/ui";

type Row = { lot: string; zoneId: string; qtyPlanned: number | null; qtyDone: number | null; manualProgress: number | null; weight: number; unit: string };
const sum = (r: Row[], k: "qtyPlanned" | "qtyDone") => r.reduce((s, i) => s + (i[k] ?? 0), 0);

export default async function RapportsPage() {
  await requireUser();
  const project = await currentProject();
  const [zones, items] = await Promise.all([
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" } }),
    prisma.workItem.findMany({ where: { projectId: project.id, kind: "GRID" , deletedAt: null }, select: { lot: true, zoneId: true, qtyPlanned: true, qtyDone: true, manualProgress: true, weight: true, unit: true } }),
  ]);
  const m = project.aggregation;
  const part = (rows: Row[], lot: string) => { const l = rows.filter((i) => i.lot === lot); return { plan: sum(l, "qtyPlanned"), site: sum(l, "qtyDone"), p: aggregate(l, m) }; };
  const line = (label: string, rows: Row[]) => ({ label, cfa: part(rows, "CFA"), cfo: part(rows, "CFO"), global: aggregate(rows, m) });
  const lines = [...zones.map((z) => line(z.name, items.filter((i) => i.zoneId === z.id))), line("TOTAL", items)];

  return (
    <>
      <div>
      <div className="mb-3 flex items-center justify-between print:hidden">
        <PageTitle sub="Résumé d'avancement par zone et par lot">Rapports</PageTitle>
        <div className="flex gap-2"><a className={btnLight} href="/api/export/suivi?format=xlsx&kind=GRID">Export Excel</a><PrintButton /></div>
      </div>
      <h2 className="mb-2 hidden text-lg font-bold print:block">{project.name} — Résumé d'avancement ({new Date().toLocaleDateString("fr-FR")})</h2>
      <table className="w-full rounded-lg border bg-white">
        <thead className="bg-slate-50"><tr>{["Zone", "CFA sur plan", "CFA sur site", "CFA %", "CFO sur plan", "CFO sur site", "CFO %", "Global %"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className={`border-t tabular-nums ${l.label === "TOTAL" ? "bg-slate-100 font-bold" : ""}`}>
              <td className={td}>{l.label}</td>
              <td className={td}>{l.cfa.plan}</td><td className={td}>{l.cfa.site}</td><td className={td}>{pct(l.cfa.p)}</td>
              <td className={td}>{l.cfo.plan}</td><td className={td}>{l.cfo.site}</td><td className={td}>{pct(l.cfo.p)}</td>
              <td className={td}>{pct(l.global)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-slate-500">Avancement = {m === "SOMME" ? "total sur site / total sur plan" : "moyenne pondérée des lignes actives"}, plafonné à 100 %.</p>
      </div>


<form action="/api/export/rapports" className={`${card} flex flex-wrap items-end gap-2 print:hidden`}>
  <label className="flex flex-col text-xs text-slate-600">Date (avancement)<input type="date" name="date" className={input} /></label>
  <label className="flex flex-col text-xs text-slate-600">Semaine du (pointage)<input type="date" name="week" className={input} /></label>
  <label className="flex flex-col text-xs text-slate-600">Chantier (pointage)<input name="site" className={input} /></label>
  <label className="flex flex-col text-xs text-slate-600">Périmètre (autocontrôle)<input name="scope" className={input} /></label>
  <button className={btn}>Télécharger le classeur courant faible (Excel)</button>
</form>
    </>
  );
}