"use client";
import { useState, useTransition } from "react";
import { saveQty } from "@/lib/actions/suivi";

export function QtyCell({ itemId, field, value, editable, big }: { itemId: string; field: "qtyPlanned" | "qtyDone"; value: number | null; editable: boolean; big?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState("");
  if (!editable) return <span className="tabular-nums">{value ?? "—"}</span>;
  return (
    <input
      key={value ?? "null"}
      type="number"
      min={0}
      step="any"
      inputMode="decimal"
      defaultValue={value ?? ""}
      title={err}
      className={`rounded border text-right tabular-nums ${big ? "h-14 w-32 text-2xl" : "w-20 px-2 py-1 text-sm"} ${err ? "border-red-500 bg-red-50" : "border-amber-300 bg-amber-50"} ${pending ? "opacity-50" : ""}`}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const v = raw === "" ? null : Number(raw);
        if (v !== null && (Number.isNaN(v) || v < 0)) return setErr("Valeur invalide");
        if (v === value) return;
        setErr("");
        start(async () => {
          try { await saveQty({ itemId, field, value: v }); } catch (x) { setErr(x instanceof Error ? x.message : "Erreur"); }
        });
      }}
    />
  );
}