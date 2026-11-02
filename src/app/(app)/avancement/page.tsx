import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isAdmin, isManager } from "@/lib/auth/permissions";
import { addRef, saveProgress } from "@/lib/actions/rapports";
import { deleteProgressSnapshot } from "@/lib/actions/delete";
import { DeleteDialog } from "@/components/delete-dialog";
import { PrintButton } from "@/components/print-button";
import { Field } from "@/components/field";
import { PageTitle, btn, btnLight, card, input, td, th } from "@/components/ui";
import { fr, isoDay, mean, parseDay, projectLine, utcDay } from "@/lib/domain/rapport";
import { getRef } from "@/lib/reference";

const P = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v)} %`);
const nums = (a: (number | undefined)[]) => a.filter((x): x is number => x != null);

export default async function AvancementPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const project = await currentProject();
  const write = canWrite(user), admin = isAdmin(user), manager = isManager(user);
  const dates = await prisma.postProgress.findMany({ where: { projectId: project.id }, distinct: ["date"], select: { date: true }, orderBy: { date: "desc" } });
  const date = parseDay(sp.date) ?? dates[0]?.date ?? utcDay();
  const [rows, posts, buildings, hist] = await Promise.all([
    prisma.postProgress.findMany({ where: { projectId: project.id, date } }),
    getRef(project.id, "POST"),
    getRef(project.id, "BUILDING"),
    prisma.postProgress.findMany({ where: { projectId: project.id, building: "" }, select: { date: true, percent: true } }),
  ]);
  const g = new Map(rows.filter((r) => !r.building).map((r) => [r.post, r]));
  const m = new Map(rows.filter((r) => r.building).map((r) => [`${r.building}|${r.post}`, r.percent]));
  const mv = (b: string, k: string) => m.get(`${b}|${k}`);
  const globalAvg = mean(nums(posts.map((p) => g.get(p.key)?.percent)));
  const allCells = nums(buildings.flatMap((b) => posts.map((p) => mv(b.label, p.key))));
  const byDate = new Map<string, number[]>();
  hist.forEach((h) => byDate.set(isoDay(h.date), [...(byDate.get(isoDay(h.date)) ?? []), h.percent]));
  const num = `${input} w-20 bg-amber-50`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <PageTitle sub="Pourcentages estimés par le chef d'équipe — moyenne simple, sans pondération par quantité">Avancement par poste</PageTitle>
        <div className="flex gap-2"><a href={`/api/export/rapports?date=${isoDay(date)}`} className={btnLight}>Excel</a><PrintButton /></div>
      </div>
      <h2 className="hidden text-lg font-bold print:block">ÉTAT D'AVANCEMENT — {projectLine(project)} — {fr(date)}</h2>

      <form className={`${card} flex flex-wrap items-end gap-2 print:hidden`}>
        <Field label="Date de l'état"><input type="date" name="date" defaultValue={isoDay(date)} className={input} /></Field>
        <button className={btnLight}>Afficher / nouvelle date</button>
        <span className="text-xs text-slate-500">Une date sans saisie ouvre un état vide, prêt à remplir.</span>
      </form>

      <form action={saveProgress} className="space-y-4">
        <input type="hidden" name="date" value={isoDay(date)} />
        <section className={card}>
          <h2 className="mb-2 font-semibold">État d'avancement global — {fr(date)}</h2>
          <table className="w-full">
            <thead className="bg-slate-50"><tr>{["Poste", "Système", "Avancement (%)", "Reste (%)", "Moyenne des bâtiments", "Observation"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {posts.map((p) => {
                const r = g.get(p.key);
                const bAvg = mean(nums(buildings.map((b) => mv(b.label, p.key))));
                const gap = r && bAvg != null && Math.abs(r.percent - bAvg) > 15;
                return (
                  <tr key={p.key} className="border-t text-sm">
                    <td className={td}>{p.label}</td><td className={td}>{p.system}</td>
                    <td className={td}>{write ? <input name={`g_${p.key}`} type="number" min={0} max={100} defaultValue={r?.percent ?? ""} className={num} /> : P(r?.percent)}</td>
                    <td className={`${td} tabular-nums`}>{r ? P(100 - r.percent) : "—"}</td>
                    <td className={`${td} tabular-nums ${gap ? "font-semibold text-amber-700" : ""}`} title={gap ? "Écart de plus de 15 points avec le global saisi" : undefined}>{P(bAvg)}{gap ? " ⚠" : ""}</td>
                    <td className={td}>{write ? <input name={`gn_${p.key}`} defaultValue={r?.note ?? ""} className={`${input} w-full`} /> : r?.note}</td>
                  </tr>
                );
              })}
              <tr className="border-t bg-slate-100 font-semibold"><td className={td} colSpan={2}>Avancement global (moyenne simple)</td><td className={td}>{P(globalAvg)}</td><td className={td}>{globalAvg == null ? "—" : P(100 - globalAvg)}</td><td /><td /></tr>
            </tbody>
          </table>
        </section>

        <section className={`${card} overflow-x-auto`}>
          <h2 className="mb-2 font-semibold">Avancement par bâtiment</h2>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className={th}>Bâtiment</th>{posts.map((p) => <th key={p.key} className={th}>{p.short ?? p.label}</th>)}<th className={th}>Moyenne bâtiment</th></tr></thead>
            <tbody>
              {buildings.map((b, bi) => (
                <tr key={b.id} className="border-t text-sm">
                  <td className={td}>{b.label}<input type="hidden" name="building" value={b.label} /></td>
                  {posts.map((p) => <td key={p.key} className={td}>{write ? <input name={`m_${bi}_${p.key}`} type="number" min={0} max={100} defaultValue={mv(b.label, p.key) ?? ""} className={num} /> : P(mv(b.label, p.key))}</td>)}
                  <td className={`${td} font-medium`}>{P(mean(nums(posts.map((p) => mv(b.label, p.key)))))}</td>
                </tr>
              ))}
              <tr className="border-t bg-slate-100 font-semibold">
                <td className={td}>Moyenne par poste</td>
                {posts.map((p) => <td key={p.key} className={td}>{P(mean(nums(buildings.map((b) => mv(b.label, p.key)))))}</td>)}
                <td className={td}>{P(mean(allCells))}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Laissez vide un poste qui n'existe pas dans le bâtiment : il est ignoré dans les moyennes.</p>
        </section>
        {write && <button className={`${btn} print:hidden`}>Enregistrer cet état ({fr(date)})</button>}
      </form>

      {manager && (
        <section className={`${card} grid gap-4 md:grid-cols-2 print:hidden`}>
          <form action={addRef} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="kind" value="BUILDING" />
            <Field label="+ Ajouter un bâtiment (ligne de la matrice)"><input name="label" required className={input} /></Field>
            <button className={btnLight}>Ajouter</button>
          </form>
          <form action={addRef} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="kind" value="POST" />
            <Field label="+ Ajouter un poste (colonne et ligne globale)"><input name="label" required className={input} /></Field>
            <Field label="Système associé"><input name="system" className={input} /></Field>
            <button className={btnLight}>Ajouter</button>
          </form>
          <p className="text-xs text-slate-500 md:col-span-2">Enregistrez d'abord l'état en cours avant d'ajouter une ligne. Gestion complète (suppression) dans Paramètres.</p>
        </section>
      )}

      <section className={`${card} print:hidden`}>
        <h2 className="mb-2 font-semibold">Évolution (avancement global par date)</h2>
        <ul className="divide-y text-sm">
          {[...byDate].sort((a, b) => b[0].localeCompare(a[0])).map(([d, v]) => (
            <li key={d} className="flex items-center justify-between py-1.5">
              <a href={`/avancement?date=${d}`} className="underline">{fr(parseDay(d))}</a>
              <span className="flex items-center gap-4"><b>{P(mean(v))}</b>
                {admin && <DeleteDialog action={deleteProgressSnapshot} fields={{ date: d }} label="Suppr." title="Supprimer cet état ?" message={`Tout l'état d'avancement du ${fr(parseDay(d))} (global et bâtiments) sera supprimé.`} />}
              </span>
            </li>
          ))}
          {byDate.size === 0 && <li className="py-2 text-slate-500">Aucun état enregistré.</li>}
        </ul>
      </section>
    </div>
  );
}