import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { canWrite, isClient } from "@/lib/auth/permissions";
import { PageTitle, btn, td, th } from "@/components/ui";
import { MATERIAL_LABEL, fr } from "@/lib/domain/rapport";

export default async function MaterielPage() {
  const user = await requireUser();
  if (isClient(user)) redirect("/dashboard");
  const project = await currentProject();
  const list = await prisma.materialRequest.findMany({ where: { projectId: project.id }, orderBy: { number: "desc" }, include: { _count: { select: { lines: true } } }, take: 200 });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PageTitle sub="Demande de matériel / bon de commande interne">Matériel</PageTitle>
        {canWrite(user) && <Link href="/materiel/new" className={btn}>+ Nouvelle demande</Link>}
      </div>
      <div className="overflow-x-auto rounded-lg border bg-white">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>{["N°", "Date", "Chantier", "Lignes", "Statut", "Créée par", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id} className="border-t text-sm">
                <td className={td}>{r.number}</td><td className={td}>{fr(r.date)}</td><td className={td}>{r.site}</td><td className={td}>{r._count.lines}</td>
                <td className={td}>{MATERIAL_LABEL[r.status]}</td><td className={td}>{r.createdBy}</td>
                <td className={td}><Link href={`/materiel/${r.id}`} className="underline">Ouvrir</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Aucune demande de matériel.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}