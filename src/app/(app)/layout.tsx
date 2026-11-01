import { Nav } from "@/components/nav";
import { logout } from "@/lib/actions/auth";
import { requireUser } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-slate-900 text-white print:hidden md:w-56 md:shrink-0">
        <div className="flex items-center justify-between px-4 pt-3 md:block">
          <div className="text-lg font-bold">⚡ VOLTAZONE</div>
          <div className="text-xs text-slate-300">{user.name} · {user.role}</div>
        </div>
        <Nav role={user.role} />
        <form action={logout} className="p-2">
          <button className="w-full rounded px-3 py-2 text-left text-sm text-slate-300 hover:bg-white/10">Déconnexion</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
    </div>
  );
}