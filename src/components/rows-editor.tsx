"use client";
import { useState } from "react";

export type Col = { key: string; label: string; type?: "text" | "number" | "date"; w?: string; step?: string; min?: number; max?: number; list?: string; placeholder?: string };
export type Computed = { key: string; label: string; kind: "sum" | "capSum" | "overtime"; from: string[]; max?: number; limit?: number; suffix?: string };
type Row = Record<string, string>;
const round = (n: number) => Math.round(n * 10) / 10;

export function RowsEditor({ prefix, columns, computed = [], footer = {}, footerLabel = "Total", initial, keyCol, minRows = 3, addLabel = "Ajouter une ligne", showIndex = false }: {
  prefix: string;
  columns: Col[];
  computed?: Computed[];
  footer?: Record<string, "sum" | "avg" | "count">;
  footerLabel?: string;
  initial: Record<string, string | number | null>[];
  keyCol: string; // une ligne est « remplie » quand cette colonne est renseignée
  minRows?: number;
  addLabel?: string;
  showIndex?: boolean;
}) {
  const blank = (): Row => Object.fromEntries(columns.map((c) => [c.key, ""]));
  const [rows, setRows] = useState<Row[]>(() => {
    const base = initial.map((r) => Object.fromEntries(columns.map((c) => [c.key, r[c.key] == null ? "" : String(r[c.key])])) as Row);
    while (base.length < minRows) base.push(blank());
    if (base[base.length - 1][keyCol].trim()) base.push(blank());
    return base;
  });
  const set = (i: number, k: string, v: string) =>
    setRows((rs) => {
      const n = rs.map((r, j) => (j === i ? { ...r, [k]: v } : r));
      if (k === keyCol && v.trim() && i === n.length - 1) n.push(blank()); // nouvelle ligne automatique
      return n;
    });
  const add = () => setRows((rs) => [...rs, blank()]);
  const del = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  const num = (r: Row, k: string) => Number(String(r[k] ?? "").replace(",", ".")) || 0;
  const calc = (c: Computed, r: Row) => {
    const s = c.from.reduce((a, k) => a + num(r, k), 0);
    return c.kind === "sum" ? s : c.kind === "capSum" ? Math.min(c.max ?? 100, s) : Math.max(0, s - (c.limit ?? 0));
  };
  const filled = rows.filter((r) => r[keyCol].trim() !== "");
  const val = (r: Row, k: string) => { const c = computed.find((x) => x.key === k); return c ? calc(c, r) : num(r, k); };
  const foot = (k: string) => {
    const op = footer[k];
    if (!op) return "";
    if (op === "count") return filled.length;
    const v = filled.map((r) => val(r, k));
    const s = v.reduce((a, b) => a + b, 0);
    return op === "sum" ? round(s) : v.length ? round(s / v.length) : "";
  };
  const cell = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  const th = "px-2 py-2 text-left text-xs font-semibold uppercase text-slate-500";

  return (
    <div className="space-y-2">
      <input type="hidden" name={`${prefix}_n`} value={rows.length} />
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50">
            <tr>
              {showIndex && <th className={th}>N°</th>}
              {columns.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              {computed.map((c) => <th key={c.key} className={th}>{c.label}</th>)}
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const on = r[keyCol].trim() !== "";
              return (
                <tr key={i} className="border-t">
                  {showIndex && <td className="px-2 text-center text-sm text-slate-500">{on ? i + 1 : ""}</td>}
                  {columns.map((c) => (
                    <td key={c.key} className="px-1 py-1">
                      <input
                        name={`${prefix}_${c.key}_${i}`} type={c.type ?? "text"} value={r[c.key]} onChange={(e) => set(i, c.key, e.target.value)}
                        step={c.step} min={c.min} max={c.max} list={c.list} placeholder={c.placeholder} className={`${cell} ${c.w ?? ""}`}
                      />
                    </td>
                  ))}
                  {computed.map((c) => <td key={c.key} className="px-2 text-sm tabular-nums">{on ? `${round(calc(c, r))}${c.suffix ?? ""}` : ""}</td>)}
                  <td className="px-1"><button type="button" onClick={() => del(i)} aria-label="Supprimer la ligne" className="text-slate-400 hover:text-red-600 print:hidden">✕</button></td>
                </tr>
              );
            })}
            {Object.keys(footer).length > 0 && (
              <tr className="border-t bg-slate-100 text-sm font-semibold tabular-nums">
                {showIndex && <td />}
                {columns.map((c, i) => <td key={c.key} className="px-3 py-2">{i === 0 ? `${footerLabel}${footer[c.key] ? ` : ${foot(c.key)}` : ""}` : foot(c.key)}</td>)}
                {computed.map((c) => <td key={c.key} className="px-2">{footer[c.key] ? `${foot(c.key)}${c.suffix ?? ""}` : ""}</td>)}
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 print:hidden">
        <button type="button" onClick={add} className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100">+ {addLabel}</button>
        <span className="text-xs text-slate-500">{filled.length} ligne(s) renseignée(s) — une nouvelle ligne s'ouvre dès que la dernière est remplie.</span>
      </div>
    </div>
  );
}