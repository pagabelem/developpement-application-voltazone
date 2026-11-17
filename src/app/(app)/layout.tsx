import { Nav } from "@/components/nav";
import { ProjectSwitcher } from "@/components/project-switcher";
import { logout } from "@/lib/actions/auth";
import { createProject } from "@/lib/actions/projects";
import { isManager } from "@/lib/auth/permissions";
import { ARCHIVED, projectContext } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, projects, project } = await projectContext();
  const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-slate-900 text-white print:hidden md:w-56 md:shrink-0">
        <div className="flex items-center justify-between px-4 pt-3 md:block">
          <div className="text-lg font-bold">⚡ VOLTAZONE</div>
          <div className="text-xs text-slate-300">{user.name} · {user.role}</div>
        </div>
        {project && <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name, archived: p.status === ARCHIVED }))} currentId={project.id} />}
        <Nav role={user.role} />
        <form action={logout} className="p-2">
          <button className="w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10">Déconnexion</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">
        {project ? children : isManager(user) ? (
          <form action={createProject} className="max-w-md space-y-3 rounded-lg border bg-white p-4">
            <h1 className="text-lg font-bold">Aucun chantier</h1>
            <p className="text-sm text-slate-600">Créez le premier chantier pour commencer.</p>
            <input name="name" required placeholder="Nom du chantier" className={`${input} w-full`} />
            <input name="client" placeholder="Client (option)" className={`${input} w-full`} />
            <button className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white">Créer le chantier</button>
          </form>
        ) : (
          <div className="max-w-xl rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            Aucun chantier ne vous est affecté pour le moment. Contactez l'administrateur.
          </div>
        )}
      </main>
    </div>
  );
}