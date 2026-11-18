import Link from "next/link";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { aggregate, isLate, STATUS_LABEL } from "@/lib/domain/calc";
import { Bar, Kpi, LotBadge, Ring, card, pct } from "@/components/ui";
import { mondayOf } from "@/lib/domain/rapport";

const BASES = [{ k: "tout", label: "Tout" }, { k: "grille", label: "Grille plan/site" }, { k: "taches", label: "Tâches" }];

// ordre d'affichage de la répartition des statuts
const STATUS_ORDER = [
  { s: "TERMINE", dot: "bg-emerald-500" },
  { s: "EN_COURS", dot: "bg-blue-500" },
  { s: "A_VERIFIER", dot: "bg-amber-400" },
  { s: "A_FAIRE", dot: "bg-slate-400" },
  { s: "BLOQUE", dot: "bg-red-500" },
];

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
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

  const isClientUser = user.role === "CLIENT";
  const [ncOpen, lastReport, weekEntries] = await Promise.all([
    prisma.nonConformity.count({ where: { projectId: project.id, status: { not: "LEVE" } } }),
    prisma.dailyReport.findFirst({ where: { projectId: project.id }, orderBy: { date: "desc" }, include: { workers: true } }),
    isClientUser ? [] : prisma.timesheetEntry.findMany({ where: { projectId: project.id, weekStart: mondayOf(new Date()) } }),
  ]);

  const weekHours = weekEntries.reduce<number>((total, e) => {
    const hours = [e.h1, e.h2, e.h3, e.h4, e.h5, e.h6];
    return total + hours.reduce<number>((sum, h) => sum + (h ?? 0), 0);
  }, 0);

  const total = aggregate(items, m);
  const cfo = aggregate(items.filter((i) => i.lot === "CFO"), m);
  const cfa = aggregate(items.filter((i) => i.lot === "CFA"), m);
  const firstName = (user.name ?? "").trim().split(/\s+/)[0] ?? "";
  const lastDate = lastReport ? lastReport.date.toLocaleDateString("fr-FR", { timeZone: "UTC" }) : null;
  const delay = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <div className="space-y-6">
      {/* ── Bandeau d'ouverture ── */}
      <section className="hero anim-fade-up rounded-3xl p-6 md:p-9">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_auto]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-volt-200 ring-1 ring-inset ring-white/15">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-volt-400" />
              Bonjour{firstName ? ` ${firstName}` : ""} · Vue d'ensemble
            </div>
            <h1 className="mt-4 font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">{project.name}</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Méthode : {m === "SOMME" ? "somme des quantités" : "moyenne pondérée"}
              {project.client ? ` · Client : ${project.client}` : ""}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
              <span className="mr-1 text-slate-400">Base de calcul</span>
              {BASES.map((b) => (
                <Link key={b.k} href={`/dashboard?base=${b.k}`} className={`rounded-full px-3.5 py-1.5 font-semibold transition ${base === b.k ? "bg-volt-400 text-slate-900 shadow-[0_6px_18px_-6px_rgba(255,170,0,.9)]" : "bg-white/10 text-slate-200 hover:bg-white/15"}`}>{b.label}</Link>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 md:gap-8">
            <Ring value={total} size={176} stroke={15} tone="volt" label="Avancement" dark />
            <div className="flex flex-col gap-4">
              <Ring value={cfo} size={84} stroke={8} tone="orange" label="CFO" dark />
              <Ring value={cfa} size={84} stroke={8} tone="blue" label="CFA" dark />
            </div>
          </div>
        </div>
      </section>

      {/* ── Indicateurs clés ── */}
      <div className="anim-fade-up grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" style={delay(60)}>
          <Kpi label="Retards" value={late} hint={late ? "lignes à rattraper" : "aucun retard"} icon="clock" tone={late ? "red" : "emerald"} href="/taches?late=1" />
          <Kpi label="Réserves ouvertes" value={ncOpen} hint="non-conformités à lever" icon="alert" tone={ncOpen ? "amber" : "emerald"} href="/non-conformites?status=OUVERT" />
          <Kpi label="Effectif" value={lastReport?.workers.length ?? "—"} hint="au dernier rapport" icon="users" tone="blue" />
          {!isClientUser && <Kpi label="Heures pointées" value={Number(weekHours.toFixed(1))} hint="cette semaine" icon="clock" tone="orange" />}
          <Kpi label="Dernier rapport" value={lastReport ? lastReport.site : "Aucun"} hint={lastDate ?? "Pas encore de rapport"} icon="file" tone="slate" compact href={lastReport ? `/rapport-jour?id=${lastReport.id}` : "/rapport-jour"} />
      </div>

      {/* ── Répartition des statuts ── */}
      <section className={`${card} anim-fade-up`} style={delay(120)}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Répartition des lignes</h2>
          <span className="text-sm text-slate-500"><b className="font-display text-slate-900">{items.length}</b> ligne(s) au total</span>
        </div>
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-200/70">
          {STATUS_ORDER.map(({ s, dot }) => count(s) > 0 && <div key={s} className={`${dot} h-full`} style={{ flexGrow: count(s), flexBasis: 0 }} title={`${STATUS_LABEL[s]} : ${count(s)}`} />)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-5">
          {STATUS_ORDER.map(({ s, dot }) => (
            <Link key={s} href={`/suivi?status=${s}`} className="group rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 transition hover:border-volt-300 hover:bg-volt-50">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><span className={`h-2 w-2 rounded-full ${dot}`} />{STATUS_LABEL[s]}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold tabular-nums">{count(s)}</span>
                <span className="text-xs text-slate-400">{items.length ? pct(count(s) / items.length) : "—"}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Avancement par zone ── */}
      <section className={`${card} anim-fade-up`} style={delay(180)}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Avancement par zone</h2>
          <div className="flex items-center gap-2 text-xs text-slate-500"><LotBadge lot="CFO" /> courant fort <LotBadge lot="CFA" /> courant faible</div>
        </div>
        {zones.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Aucune zone pour ce chantier. Ajoutez-en dans « Zones ».</p>}
        <div className="divide-y divide-slate-100">
          {zones.map((z) => {
            const zi = items.filter((i) => i.zoneId === z.id);
            return (
              <div key={z.id} className="grid items-center gap-x-4 gap-y-1.5 py-3 md:grid-cols-[15rem_5.5rem_1fr_1fr]">
                <Link href={`/suivi?zone=${z.id}`} className="font-semibold text-slate-800 transition hover:text-volt-600">{z.name}</Link>
                <span className="w-fit rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">{zi.length} ligne(s)</span>
                <Bar lot="CFO" value={aggregate(zi.filter((i) => i.lot === "CFO"), m)} />
                <Bar lot="CFA" value={aggregate(zi.filter((i) => i.lot === "CFA"), m)} />
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Avancement par système ── */}
      <section className={`${card} anim-fade-up`} style={delay(240)}>
        <h2 className="mb-3 font-display text-lg font-bold">Avancement par système</h2>
        <div className="grid gap-2.5 md:grid-cols-2">
          {systems.map((s) => (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <LotBadge lot={s.lot} />
              <span className="w-36 shrink-0 truncate text-sm font-medium" title={s.name}>{s.name}</span>
              <div className="min-w-0 flex-1"><Bar lot={s.lot} value={aggregate(items.filter((i) => i.systemId === s.id), m)} /></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}