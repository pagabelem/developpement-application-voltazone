import Link from "next/link";
import type { ReactNode } from "react";
import { STATUS_LABEL } from "@/lib/domain/calc";
import { Icon, type IconName } from "@/components/icons";

// [pastille + texte, point de couleur]
const STATUS_STYLE: Record<string, [string, string]> = {
  NON_RENSEIGNE: ["bg-slate-100 text-slate-500 ring-slate-200", "bg-slate-300"],
  A_VERIFIER: ["bg-amber-50 text-amber-800 ring-amber-200", "bg-amber-400"],
  A_FAIRE: ["bg-slate-100 text-slate-700 ring-slate-300", "bg-slate-400"],
  EN_COURS: ["bg-blue-50 text-blue-800 ring-blue-200", "bg-blue-500"],
  TERMINE: ["bg-emerald-50 text-emerald-800 ring-emerald-200", "bg-emerald-500"],
  BLOQUE: ["bg-red-50 text-red-800 ring-red-200", "bg-red-500"],
  SANS_OBJET: ["bg-slate-50 text-slate-400 ring-slate-200", "bg-slate-300"],
};

export const card = "v-card";
export const btn = "v-btn";
export const btnLight = "v-btn-light";
export const input = "v-input";
export const th = "px-2.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-wider text-slate-500";
export const td = "px-2.5 py-2 text-sm";

export const pct = (v: number | null | undefined) => (v == null ? "—" : `${Math.round(v * 100)} %`);
export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");

export function StatusBadge({ status }: { status: string }) {
  const [tone, dot] = STATUS_STYLE[status] ?? STATUS_STYLE.NON_RENSEIGNE;
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function LotBadge({ lot }: { lot: string }) {
  return (
    <span className={`inline-block rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide ring-1 ring-inset ${lot === "CFA" ? "bg-blue-50 text-blue-700 ring-blue-200" : "bg-orange-50 text-orange-700 ring-orange-200"}`}>
      {lot}
    </span>
  );
}

export function Bar({ value, lot }: { value: number | null; lot?: string }) {
  const tone = lot === "CFA" ? "bar-cfa" : lot === "CFO" ? "bar-cfo" : "bar-all";
  const w = Math.round(Math.min(1, Math.max(0, value ?? 0)) * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${w}%` }} />
      </div>
      <span className="w-12 text-right text-xs font-bold tabular-nums text-slate-700">{pct(value)}</span>
    </div>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <div className="mb-6">
      <h1 className="v-title text-[1.65rem] leading-tight text-slate-900 md:text-3xl">{children}</h1>
      {sub && <p className="mt-2 text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

// Anneau de progression animé (SVG)
const RING_TONES: Record<string, [string, string]> = {
  volt: ["#ffd75e", "#ff9f0a"],
  orange: ["#fdba74", "#ea580c"],
  blue: ["#67e8f9", "#3b82f6"],
  green: ["#6ee7b7", "#059669"],
};

export function Ring({ value, size = 120, stroke = 10, tone = "volt", label, dark = false }: { value: number | null; size?: number; stroke?: number; tone?: keyof typeof RING_TONES; label?: string; dark?: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value ?? 0));
  const [a, b] = RING_TONES[tone];
  const gid = `ring-${tone}`;
  const arc = { "--c": c, "--o": c * (1 - v) } as React.CSSProperties;
  return (
    <div className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={a} />
            <stop offset="1" stopColor={b} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={dark ? "rgba(255,255,255,.12)" : "#e3e8f1"} />
        <circle className="ring-arc" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke={`url(#${gid})`} strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={arc} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className={`font-display font-bold leading-none tabular-nums ${dark ? "text-white" : "text-slate-900"}`} style={{ fontSize: size * 0.22 }}>{pct(value)}</div>
          {label && <div className={`mt-1 font-semibold uppercase tracking-[.14em] ${dark ? "text-slate-400" : "text-slate-500"}`} style={{ fontSize: Math.max(9, size * 0.075) }}>{label}</div>}
        </div>
      </div>
    </div>
  );
}

// Tuile d'indicateur (lien cliquable si href)
const KPI_TONES: Record<string, [string, string]> = {
  slate: ["bg-slate-100 text-slate-600", "text-slate-900"],
  red: ["bg-red-50 text-red-600", "text-red-600"],
  amber: ["bg-amber-50 text-amber-600", "text-slate-900"],
  blue: ["bg-blue-50 text-blue-600", "text-slate-900"],
  orange: ["bg-orange-50 text-orange-600", "text-slate-900"],
  emerald: ["bg-emerald-50 text-emerald-600", "text-slate-900"],
};

export function Kpi({ label, value, hint, icon, tone = "slate", href, compact = false }: { label: string; value: ReactNode; hint?: string; icon: IconName; tone?: keyof typeof KPI_TONES; href?: string; compact?: boolean }) {
  const [chip, num] = KPI_TONES[tone];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${chip}`}><Icon name={icon} /></span>
      </div>
      <div className={`mt-3 font-display font-bold tabular-nums leading-none ${compact ? "text-base leading-snug" : "text-3xl"} ${num}`}>{value}</div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </>
  );
  return href ? <Link href={href} className={card}>{body}</Link> : <div className={card}>{body}</div>;
}