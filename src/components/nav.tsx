"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icons";

type Item = { href: string; label: string; icon: IconName; mgr?: boolean; admin?: boolean; field?: boolean; noClient?: boolean };

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Pilotage",
    items: [
      { href: "/dashboard", label: "Tableau de bord", icon: "dashboard" },
      { href: "/suivi", label: "Suivi", icon: "table" },
      { href: "/taches", label: "Tâches", icon: "check" },
      { href: "/zones", label: "Zones", icon: "layers" },
      { href: "/planning", label: "Planning", icon: "calendar" },
      { href: "/blocages", label: "Blocages", icon: "ban" },
    ],
  },
  {
    label: "Terrain",
    items: [
      { href: "/rapport-jour", label: "Rapports journaliers", icon: "file" },
      { href: "/avancement", label: "Avancement par poste", icon: "chart" },
      { href: "/pointage", label: "Pointage", icon: "clock", noClient: true },
      { href: "/autocontrole", label: "Autocontrôle", icon: "shield" },
      { href: "/non-conformites", label: "Non-conformités", icon: "alert" },
      { href: "/materiel", label: "Matériel", icon: "box", noClient: true },
      { href: "/terrain", label: "Saisie terrain", icon: "phone", field: true },
    ],
  },
  {
    label: "Analyse",
    items: [
      { href: "/historique", label: "Historique", icon: "history" },
      { href: "/rapports", label: "Rapports", icon: "printer" },
      { href: "/assistant", label: "Assistant IA", icon: "sparkles", noClient: true },
    ],
  },
  {
    label: "Gestion",
    items: [
      { href: "/equipes", label: "Équipes", icon: "users", mgr: true },
      { href: "/import", label: "Import", icon: "upload", mgr: true },
      { href: "/parametres", label: "Paramètres", icon: "sliders", mgr: true },
      { href: "/audit", label: "Audit", icon: "eye", admin: true },
      { href: "/aide", label: "Aide", icon: "help" },
    ],
  },
];

export function Nav({ role }: { role: string }) {
  const path = usePathname();
  const mgr = role === "ADMIN" || role === "CONDUCTEUR";
  const allowed = (i: Item) => (!i.mgr || mgr) && (!i.admin || role === "ADMIN") && (!i.field || role !== "CLIENT") && (!i.noClient || role !== "CLIENT");

  return (
    <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-3 pb-3 pt-2 md:flex-col md:gap-0 md:overflow-visible md:pb-4">
      {GROUPS.map((g) => {
        const items = g.items.filter(allowed);
        if (!items.length) return null;
        return (
          <div key={g.label} className="flex gap-1 md:flex-col md:gap-0.5 md:pt-3">
            <div className="hidden px-3 pb-1 text-[10px] font-bold uppercase tracking-[.18em] text-slate-500 md:block">{g.label}</div>
            {items.map((i) => {
              const active = path.startsWith(i.href);
              return (
                <Link
                  key={i.href}
                  href={i.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex shrink-0 items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2 text-[13.5px] font-medium transition-colors ${active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
                >
                  {active && <span className="absolute -left-3 bottom-2 top-2 hidden w-1 rounded-r-full bg-volt-400 shadow-[0_0_12px_rgba(255,194,26,.8)] md:block" />}
                  <Icon name={i.icon} className={`h-[18px] w-[18px] shrink-0 transition-colors ${active ? "text-volt-300" : "text-slate-400 group-hover:text-slate-200"}`} />
                  {i.label}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}