import { Nav } from "@/components/nav";
import { Icon } from "@/components/icons";
import { ProjectSwitcher } from "@/components/project-switcher";
import { logout } from "@/lib/actions/auth";
import { createProject } from "@/lib/actions/projects";
import { isManager } from "@/lib/auth/permissions";
import { ARCHIVED, projectContext } from "@/lib/session";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  CONDUCTEUR: "Conducteur de travaux",
  CHEF_CFO: "Chef d'équipe CFO",
  CHEF_CFA: "Chef d'équipe CFA",
  CLIENT: "Client / MOA",
};
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join("") || "?";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, projects, project } = await projectContext();
  const field = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm";
  const logoutBtn = "grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white";

  return (
    <div className="min-h-screen md:flex">
      <aside className="sidebar-surface text-white print:hidden md:sticky md:top-0 md:flex md:h-screen md:w-[17rem] md:shrink-0 md:flex-col md:self-start">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-5 md:pb-2 md:pt-6">
          <div className="flex items-center gap-3">
            <span className="logo-mark"><Icon name="bolt" filled className="h-[22px] w-[22px]" /></span>
            <div className="leading-tight">
              <div className="font-display text-[1.05rem] font-bold tracking-[.14em]">VOLTAZONE</div>
              <div className="text-[11px] text-slate-400">Chantier électrique</div>
            </div>
          </div>
          <form action={logout} className="md:hidden">
            <button aria-label="Déconnexion" className={logoutBtn}><Icon name="logout" /></button>
          </form>
        </div>

        {project && <ProjectSwitcher projects={projects.map((p) => ({ id: p.id, name: p.name, archived: p.status === ARCHIVED }))} currentId={project.id} />}

        <div className="sidebar-scroll min-h-0 flex-1 md:overflow-y-auto">
          <Nav role={user.role} />
        </div>

        <div className="hidden items-center gap-3 border-t border-white/10 p-4 md:flex">
          <span style={{ background: "linear-gradient(135deg,#485872,#1b263c)" }} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-volt-200 ring-2 ring-white/10">{initials(user.name)}</span>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">{user.name}</div>
            <div className="truncate text-[11px] text-slate-400">{ROLE_LABEL[user.role] ?? user.role}</div>
          </div>
          <form action={logout}>
            <button aria-label="Déconnexion" title="Déconnexion" className={logoutBtn}><Icon name="logout" /></button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1500px] px-4 py-5 md:px-8 md:py-8">
          {project ? children : isManager(user) ? (
            <form action={createProject} className="v-card max-w-md space-y-3">
              <h1 className="v-title text-xl">Aucun chantier</h1>
              <p className="text-sm text-slate-600">Créez le premier chantier pour commencer.</p>
              <input name="name" required placeholder="Nom du chantier" className={field} />
              <input name="client" placeholder="Client (option)" className={field} />
              <button className="v-btn">Créer le chantier</button>
            </form>
          ) : (
            <div className="max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              Aucun chantier ne vous est affecté pour le moment. Contactez l'administrateur.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}