"use client";
import { useEffect, useRef, useState } from "react";

type Opt = { id: string; label: string };
type Msg = { role: "user" | "assistant"; content: string };
type Scope = { period: string; from: string; to: string; zoneId: string; site: string; teamId: string };

const PERIODS: [string, string][] = [["today", "Aujourd'hui"], ["yesterday", "Hier"], ["week", "Cette semaine"], ["month", "Ce mois"], ["custom", "Personnalisée"]];
const QUICK = [
  { label: "Synthèse du jour", period: "today", text: "Fais la synthèse de la journée : effectif, avancement par système, problèmes, sécurité et travaux prévus demain." },
  { label: "Bilan de la semaine", period: "week", text: "Fais le bilan de la semaine : avancement, heures et heures supplémentaires, retards, réserves et blocages." },
  { label: "Bilan mensuel", period: "month", text: "Fais le bilan mensuel : évolution de l'avancement, retards, réserves ouvertes et risques pour le planning." },
  { label: "Retards et blocages", period: "week", text: "Quels sont les retards et blocages les plus critiques, et que recommandes-tu ?" },
  { label: "Sécurité", period: "month", text: "Analyse les points sécurité remontés sur la période et propose des actions de prévention." },
];

function Md({ text }: { text: string }) {
  const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, k) => (k % 2 ? <b key={k}>{p}</b> : p));
  return (
    <div className="space-y-1 text-sm">
      {text.split("\n").map((l, i) => {
        const t = l.trim();
        if (!t) return <div key={i} className="h-2" />;
        if (/^#{1,4}\s/.test(t)) return <h4 key={i} className="mt-2 font-semibold">{bold(t.replace(/^#{1,4}\s/, ""))}</h4>;
        if (/^[-*•]\s/.test(t)) return <div key={i} className="flex gap-2"><span>•</span><span>{bold(t.slice(2))}</span></div>;
        return <p key={i}>{bold(t)}</p>;
      })}
    </div>
  );
}

export function AiChat({ zones, sites, teams }: { zones: Opt[]; sites: Opt[]; teams: Opt[] }) {
  const [scope, setScope] = useState<Scope>({ period: "today", from: "", to: "", zoneId: "", site: "", teamId: "" });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function send(text: string, period?: string) {
    const content = text.trim();
    if (!content || loading) return;
    const sc = period ? { ...scope, period } : scope;
    if (period) setScope(sc);
    const history: Msg[] = [...messages, { role: "user", content }];
    setMessages(history);
    setInput("");
    setLoading(true);
    setError("");
    try {
      const clean = Object.fromEntries(Object.entries(sc).filter(([, v]) => v));
      const r = await fetch("/api/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-12), scope: clean }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Erreur HTTP ${r.status}`);
      setMessages([...history, { role: "assistant", content: d.answer }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const sel = "rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";
  const set = (k: keyof Scope) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setScope({ ...scope, [k]: e.target.value });
  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-lg border bg-white p-3 md:grid-cols-3">
        <label className="flex flex-col text-xs text-slate-600">Période<select value={scope.period} onChange={set("period")} className={sel}>{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        {scope.period === "custom" && <>
          <label className="flex flex-col text-xs text-slate-600">Du<input type="date" value={scope.from} onChange={set("from")} className={sel} /></label>
          <label className="flex flex-col text-xs text-slate-600">Au<input type="date" value={scope.to} onChange={set("to")} className={sel} /></label>
        </>}
        <label className="flex flex-col text-xs text-slate-600">Zone<select value={scope.zoneId} onChange={set("zoneId")} className={sel}><option value="">Toutes</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
        <label className="flex flex-col text-xs text-slate-600">Chantier / bâtiment<select value={scope.site} onChange={set("site")} className={sel}><option value="">Tous</option>{sites.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
        <label className="flex flex-col text-xs text-slate-600">Équipe / chef<select value={scope.teamId} onChange={set("teamId")} className={sel}><option value="">Toutes</option>{teams.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}</select></label>
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => <button key={q.label} type="button" disabled={loading} onClick={() => send(q.text, q.period)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50">{q.label}</button>)}
      </div>
      <div className="min-h-64 space-y-3 rounded-lg border bg-white p-4">
        {messages.length === 0 && <p className="text-sm text-slate-500">Choisissez un périmètre puis un bouton rapide, ou posez votre question ci-dessous.</p>}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%] rounded-lg bg-slate-900 p-3 text-sm text-white" : "max-w-[95%] rounded-lg bg-slate-50 p-3"}>
            {m.role === "user" ? m.content : <Md text={m.content} />}
          </div>
        ))}
        {loading && <p className="text-sm text-slate-500">Analyse en cours…</p>}
        {error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ex. Pourquoi le Futsal est-il en retard ?" className="flex-1 rounded border border-slate-300 px-3 py-2 text-sm" />
        <button disabled={loading || !input.trim()} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">Envoyer</button>
      </form>
    </div>
  );
}