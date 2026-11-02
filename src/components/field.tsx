import type { ReactNode } from "react";

export function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return <label className={`flex flex-col gap-1 text-xs text-slate-600 ${wide ? "md:col-span-2" : ""}`}>{label}{children}</label>;
}