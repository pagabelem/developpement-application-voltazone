import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { aggregate, isLate, STATUS_LABEL } from "@/lib/domain/calc";
import { Bar, PageTitle, card, pct } from "@/components/ui";

const BASES = [{ k: "tout", label: "Tout" }, { k: "grille", label: "Grille plan/site" }, { k: "taches", label: "Tâches" }];

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireUser();
  const project = await currentProject();
  const base = sp.base === "grille" || sp.base === "taches" ? sp.base : "tout";
  const kind = base === "grille" ? { kind: "GRID" } : base === "taches" ? { kind: "TASK" } : {};
  const [items, zones, systems] = await Promise.all([
    prisma.workItem.findMany({ where: { projectId: project.id, deletedAt: null, ...kind }, select: { lot: true, zoneId: true, systemId: true, status: true, qtyPlanned: true, qtyDone: true, manualProgress: true, weight: true, unit: true, plannedEnd: true } }),
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null }, orderBy: { order: "asc" } }),
    prisma.system.findMany({ where: { projectId: project.id }, orderBy: [{ lot: "asc" }, { order: "asc" }] }),
  ]);
  const m = project.aggregation;
  const count = (s: string) => items.filter((i) => i.status === s).length;
  const late = items.filter((i) => isLate(i.plannedEnd, i.status)).length;

  return (
    <div className="space-y-6">
      <PageTitle sub={`${project.name} — méthode : ${m === "SOMME" ? "somme des quantités" : "moyenne pondérée"}`}>Tableau de bord</PageTitle>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Base de calcul :</span>
        {BASES.map((b) => <Link key={b.k} href={`/dashboard?base=${b.k}`} className={`rounded border px-3 py-1 ${base === b.k ? "bg-slate-900 text-white" : "bg-white"}`}>{b.label}</Link>)}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={card}><div className="text-xs text-slate-500">Avancement moyen</div><div className="text-3xl font-bold">{pct(aggregate(items, m))}</div></div>
        <div className={card}><div className="text-xs text-orange-600">Avancement CFO</div><div className="text-3xl font-bold">{pct(aggregate(items.filter((i) => i.lot === "CFO"), m))}</div></div>
        <div className={card}><div className="text-xs text-blue-600">Avancement CFA</div><div className="text-3xl font-bold">{pct(aggregate(items.filter((i) => i.lot === "CFA"), m))}</div></div>
        <Link href="/taches?late=1" className={card}><div className="text-xs text-red-600">Retards</div><div className="text-3xl font-bold">{late}</div></Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <div className={card}><div className="text-xs text-slate-500">Nombre de lignes</div><div className="text-2xl font-bold">{items.length}</div></div>
        {["A_FAIRE", "EN_COURS", "BLOQUE", "TERMINE", "A_VERIFIER"].map((s) => (
          <Link key={s} href={`/suivi?status=${s}`} className={card}><div className="text-xs text-slate-500">{STATUS_LABEL[s]}</div><div className="text-2xl font-bold">{count(s)}</div></Link>
        ))}
      </div>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Avancement par zone</h2>
        <div className="space-y-3">
          {zones.map((z) => {
            const zi = items.filter((i) => i.zoneId === z.id);
            return (
              <div key={z.id} className="grid items-center gap-1 md:grid-cols-[16rem_5rem_1fr_1fr]">
                <Link href={`/suivi?zone=${z.id}`} className="font-medium hover:underline">{z.name}</Link>
                <span className="text-xs text-slate-500">{zi.length} ligne(s)</span>
                <Bar lot="CFO" value={aggregate(zi.filter((i) => i.lot === "CFO"), m)} />
                <Bar lot="CFA" value={aggregate(zi.filter((i) => i.lot === "CFA"), m)} />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Orange = CFO · Bleu = CFA</p>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-semibold">Avancement par système</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {systems.map((s) => (
            <div key={s.id} className="grid grid-cols-[11rem_1fr] items-center gap-2 text-sm">
              <span>{s.name}</span>
              <Bar lot={s.lot} value={aggregate(items.filter((i) => i.systemId === s.id), m)} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}