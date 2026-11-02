import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentProject, requireUser } from "@/lib/session";
import { getEditScope, isClient } from "@/lib/auth/permissions";
import { getRef } from "@/lib/reference";
import { AiChat } from "@/components/ai-chat";
import { PageTitle } from "@/components/ui";

export default async function AssistantPage() {
  const user = await requireUser();
  if (isClient(user)) redirect("/dashboard");
  const project = await currentProject();
  const scope = await getEditScope(user);
  const [zones, sites, teams] = await Promise.all([
    prisma.zone.findMany({ where: { projectId: project.id, deletedAt: null, ...(scope.all ? {} : { id: { in: [...scope.zones] } }) }, orderBy: { order: "asc" } }),
    getRef(project.id, "BUILDING"),
    prisma.team.findMany({ where: { projectId: project.id, deletedAt: null, ...(scope.all ? {} : { leaderId: user.id }) }, orderBy: [{ lot: "asc" }, { name: "asc" }] }),
  ]);
  return (
    <div className="max-w-4xl space-y-4">
      <PageTitle sub="Analyse du jour, de la semaine ou du mois — par zone, chantier, équipe ou chef. Les noms des ouvriers ne sont jamais transmis.">Assistant IA</PageTitle>
      {!process.env.AI_API_KEY && <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">IA non configurée : ajoutez <b>AI_API_KEY</b> dans le fichier .env, puis redémarrez le serveur.</div>}
      <AiChat zones={zones.map((z: { id: string; name: string }) => ({ id: z.id, label: z.name }))} sites={sites.map((s: { label: string }) => ({ id: s.label, label: s.label }))} teams={teams.map((t: { id: string; lot: string; leaderName: string | null; name: string }) => ({ id: t.id, label: `${t.lot} — ${t.leaderName ?? t.name}` }))} />
    </div>
  );
}