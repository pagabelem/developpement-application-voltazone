import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canEdit, getEditScope } from "@/lib/auth/permissions";
import { rowProgress } from "@/lib/domain/calc";
import { Bar, LotBadge, StatusBadge } from "@/components/ui";
import { QtyCell } from "@/components/qty-cell";

const big = "block rounded-lg border bg-white p-5 text-xl font-semibold shadow-sm active:bg-slate-100";

export default async function TerrainPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  if (user.role === "CLIENT") redirect("/dashboard");
  const project = await currentProject();
  const scope = await getEditScope(user);

  let body: React.ReactNode;
  if (!sp.zone) {
    const zones = await prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null, ...(scope.all ? {} : { id: { in: [...scope.zones] } }) }, orderBy: { order: "asc" } });
    body = <>{zones.map((z) => <Link key={z.id} href={`/terrain?zone=${z.id}`} className={big}>{z.name}</Link>)}{zones.length === 0 && <p>Aucune zone affectée à votre équipe.</p>}</>;
  } else if (!sp.level) {
    const levels = await prisma.level.findMany({ where: { projectId: project.id }, orderBy: { order: "asc" } });
    body = <>{levels.map((l) => <Link key={l.id} href={`/terrain?zone=${sp.zone}&level=${l.id}`} className={big}>{l.label}</Link>)}</>;
  } else {
    const items = await prisma.workItem.findMany({
      where: { projectId: project.id, zoneId: sp.zone, levelId: sp.level, deletedAt: null, ...(scope.all ? {} : { lot: scope.lot ?? undefined }) },
      include: { system: true },
      orderBy: [{ lot: "asc" }, { system: { order: "asc" } }],
    });
    body = (
      <>
        {items.map((i) => (
          <div key={i.id} className="space-y-2 rounded-lg border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between"><span className="text-lg font-semibold">{i.system?.name ?? i.title}</span><LotBadge lot={i.lot} /></div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-slate-500">Sur plan<div className="text-2xl font-bold text-slate-900">{i.qtyPlanned ?? "—"}</div></div>
              <div className="text-sm text-slate-500">Sur site<div><QtyCell itemId={i.id} field="qtyDone" value={i.qtyDone} editable={canEdit(scope, i)} big /></div></div>
            </div>
            <Bar value={rowProgress(i.qtyPlanned, i.qtyDone)} lot={i.lot} />
            <StatusBadge status={i.status} />
          </div>
        ))}
      </>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">⚡ Saisie terrain</h1>
        <Link href={sp.level ? `/terrain?zone=${sp.zone}` : sp.zone ? "/terrain" : "/dashboard"} className="text-sm underline">← Retour</Link>
      </div>
      {body}
    </main>
  );
}