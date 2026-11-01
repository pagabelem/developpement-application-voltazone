"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "Tableau de bord" },
  { href: "/suivi", label: "Suivi" },
  { href: "/taches", label: "Tâches" },
  { href: "/zones", label: "Zones" },
  { href: "/planning", label: "Planning" },
  { href: "/equipes", label: "Équipes", mgr: true },
  { href: "/blocages", label: "Blocages" },
  { href: "/rapports", label: "Rapports" },
  { href: "/import", label: "Import", mgr: true },
  { href: "/parametres", label: "Paramètres", mgr: true },
  { href: "/audit", label: "Audit", admin: true },
  { href: "/terrain", label: "Saisie terrain", field: true },
  { href: "/aide", label: "Aide" },
];

export function Nav({ role }: { role: string }) {
  const path = usePathname();
  const mgr = role === "ADMIN" || role === "CONDUCTEUR";
  const items = ITEMS.filter((i) => (!i.mgr || mgr) && (!i.admin || role === "ADMIN") && (!i.field || role !== "CLIENT"));
  return (
    <nav className="flex gap-1 overflow-x-auto p-2 md:flex-col">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={`whitespace-nowrap rounded px-3 py-2 text-sm ${path.startsWith(i.href) ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}