"use client";
import { useRef } from "react";
import { switchProject } from "@/lib/actions/projects";
import { Icon } from "@/components/icons";

type P = { id: string; name: string; archived: boolean };

export function ProjectSwitcher({ projects, currentId }: { projects: P[]; currentId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  const shell = "mx-3 mt-3 rounded-2xl border border-white/10 bg-white/[.06] p-3 backdrop-blur md:mx-4 print:hidden";
  const label = (
    <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">
      <Icon name="building" className="h-3.5 w-3.5 text-volt-300" /> Chantier
    </div>
  );

  if (projects.length < 2) {
    return (
      <div className={shell}>
        {label}
        <div className="truncate text-sm font-semibold text-white">{projects[0]?.name}</div>
      </div>
    );
  }

  return (
    <form ref={ref} action={switchProject} className={shell}>
      <label htmlFor="project-switch">{label}</label>
      <div className="relative">
        <select
          id="project-switch" name="projectId" defaultValue={currentId} onChange={() => ref.current?.requestSubmit()}
          className="w-full cursor-pointer appearance-none rounded-xl border border-white/10 bg-slate-900/70 py-2 pl-3 pr-9 text-sm font-semibold text-white"
        >
          {projects.map((p) => <option key={p.id} value={p.id} className="text-slate-900">{p.name}{p.archived ? " (archivé)" : ""}</option>)}
        </select>
        <Icon name="chevron" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
      </div>
    </form>
  );
}