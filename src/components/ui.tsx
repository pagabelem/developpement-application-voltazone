import { STATUS_LABEL } from "@/lib/domain/calc";

const STATUS_COLOR: Record<string, string> = {
  NON_RENSEIGNE: "bg-slate-100 text-slate-500",
  A_VERIFIER: "bg-yellow-100 text-yellow-800",
  A_FAIRE: "bg-slate-200 text-slate-700",
  EN_COURS: "bg-blue-100 text-blue-800",
  TERMINE: "bg-green-100 text-green-800",
  BLOQUE: "bg-red-100 text-red-800",
  SANS_OBJET: "bg-slate-100 text-slate-400",
};

export const card = "rounded-lg border border-slate-200 bg-white p-4 shadow-sm";
export const btn = "inline-block rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700";
export const btnLight = "inline-block rounded border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-100";
export const input = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
export const th = "px-2 py-2 text-left text-xs font-semibold uppercase text-slate-500";
export const td = "px-2 py-1.5 text-sm";

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)} %`);
export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export function StatusBadge({ status }: { status: string }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function LotBadge({ lot }: { lot: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${lot === "CFA" ? "bg-blue-100 text-blue-800" : "bg-orange-100 text-orange-800"}`}>{lot}</span>;
}

export function Bar({ value, lot }: { value: number | null; lot?: string }) {
  const color = lot === "CFA" ? "bg-blue-500" : lot === "CFO" ? "bg-orange-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-full min-w-16 rounded bg-slate-200">
        <div className={`h-2.5 rounded ${color}`} style={{ width: `${Math.round((value ?? 0) * 100)}%` }} />
      </div>
      <span className="w-12 text-right text-xs tabular-nums">{pct(value)}</span>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-xl font-bold">{children}</h1>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}