"use client";
import { useRef } from "react";
import { switchProject } from "@/lib/actions/projects";

type P = { id: string; name: string; archived: boolean };

export function ProjectSwitcher({ projects, currentId }: { projects: P[]; currentId: string }) {
  const ref = useRef<HTMLFormElement>(null);
  if (projects.length < 2) {
    return <div className="px-4 pt-2 text-xs text-slate-300 print:hidden">Chantier : <b>{projects[0]?.name}</b></div>;
  }
  return (
    <form ref={ref} action={switchProject} className="px-3 pt-2 print:hidden">
      <label htmlFor="project-switch" className="block text-[11px] uppercase tracking-wide text-slate-400">Chantier</label>
      <select
        id="project-switch" name="projectId" defaultValue={currentId} onChange={() => ref.current?.requestSubmit()}
        className="mt-1 w-full rounded border border-slate-600 bg-slate-800 px-2 py-1.5 text-sm text-white"
      >
        {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archivé)" : ""}</option>)}
      </select>
    </form>
  );
}