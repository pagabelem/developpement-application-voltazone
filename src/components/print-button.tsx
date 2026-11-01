"use client";
export function PrintButton() {
  return <button onClick={() => window.print()} className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white print:hidden">Imprimer / PDF</button>;
}