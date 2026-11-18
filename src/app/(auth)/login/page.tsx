"use client";
import { useActionState, useState } from "react";
import { login } from "@/lib/actions/auth";
import { Icon, type IconName } from "@/components/icons";

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "trend", title: "Avancement en temps réel", text: "Chaque zone, chaque niveau, chaque système, d'un coup d'œil." },
  { icon: "shield", title: "Autocontrôle & réserves", text: "Points de contrôle et non-conformités tracés jusqu'à la levée." },
  { icon: "users", title: "Équipes, pointage & matériel", text: "Du rapport journalier à l'export PDF et Excel." },
];

// Circuit électrique décoratif : tracés orthogonaux + impulsions animées
const PATHS = [
  "M-20 140 H170 V250 H350 V170 H540 V310 H900",
  "M-20 430 H130 V560 H320 V470 H470 V650 H900",
  "M-20 780 H240 V710 H420 V830 H640 V750 H900",
  "M260 -20 V90 H470 V-20",
  "M600 -20 V120 H760 V260 H900",
];
const NODES: [number, number][] = [[170, 140], [170, 250], [350, 250], [350, 170], [540, 170], [540, 310], [130, 430], [130, 560], [320, 560], [320, 470], [470, 470], [470, 650], [240, 780], [240, 710], [420, 710], [420, 830], [640, 830], [640, 750]];

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      {/* ── Scène de marque ── */}
      <section className="hero hidden rounded-none shadow-none lg:block">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 880 900" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
          <g stroke="rgba(255,255,255,.09)" strokeWidth="1.5" strokeLinejoin="round">
            {PATHS.map((d, i) => <path key={i} d={d} />)}
          </g>
          <g className="circuit-flow" stroke="#ffc21a" strokeWidth="2" strokeLinecap="round" strokeDasharray="8 120" style={{ filter: "drop-shadow(0 0 6px rgba(255,194,26,.9))" }}>
            {PATHS.map((d, i) => <path key={i} d={d} style={{ animationDelay: `${i * -1.1}s` }} />)}
          </g>
          <g fill="#ffc21a">
            {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" className="node" style={{ animationDelay: `${(i % 6) * 0.4}s` }} />)}
          </g>
        </svg>

        <div className="relative z-10 flex h-full flex-col justify-between p-12 xl:p-16">
          <div className="flex items-center gap-3">
            <span className="logo-mark"><Icon name="bolt" filled className="h-[22px] w-[22px]" /></span>
            <span className="font-display text-xl font-bold tracking-[.16em]">VOLTAZONE</span>
          </div>

          <div className="max-w-xl">
            <h1 className="font-display text-5xl font-bold leading-[1.05] tracking-tight xl:text-6xl">
              Pilotez votre chantier électrique,{" "}
              <span style={{ background: "linear-gradient(90deg,#ffd75e,#ff9f0a)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>zone par zone.</span>
            </h1>
            <ul className="mt-10 space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-4">
                  <span className="glass-dark grid h-11 w-11 shrink-0 place-items-center rounded-xl text-volt-300"><Icon name={f.icon} className="h-5 w-5" /></span>
                  <div>
                    <div className="font-semibold">{f.title}</div>
                    <div className="text-sm text-slate-300">{f.text}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="glass-dark anim-float w-72 rounded-2xl p-4">
            <div className="mb-3 flex items-center justify-between text-xs font-semibold text-slate-300">
              <span>Avancement par zone</span>
              <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />En direct</span>
            </div>
            {[["Zone A", "bar-cfo", 82], ["Zone B", "bar-cfa", 61], ["Zone C", "bar-all", 37]].map(([n, tone, w]) => (
              <div key={n as string} className="mb-2.5 last:mb-0">
                <div className="mb-1 text-[11px] text-slate-400">{n}</div>
                <div className="bar-track" style={{ background: "rgba(255,255,255,.1)" }}>
                  <div className={`bar-fill ${tone}`} style={{ width: `${w}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Formulaire ── */}
      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <form action={action} className="anim-fade-up w-full max-w-[26rem] space-y-5">
          <div className="flex items-center gap-3 lg:hidden">
            <span className="logo-mark"><Icon name="bolt" filled className="h-[22px] w-[22px]" /></span>
            <span className="font-display text-xl font-bold tracking-[.16em]">VOLTAZONE</span>
          </div>

          <div>
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">Connexion</h2>
            <p className="mt-1.5 text-sm text-slate-500">Accédez à votre espace chantier.</p>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Adresse e-mail</span>
            <span className="relative block">
              <Icon name="mail" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input name="email" type="email" required placeholder="vous@entreprise.com" autoComplete="username" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-3 text-[15px] shadow-xs placeholder:text-slate-400" />
            </span>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Mot de passe</span>
            <span className="relative block">
              <Icon name="lock" className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
              <input name="password" type={show ? "text" : "password"} required placeholder="••••••••" autoComplete="current-password" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-12 text-[15px] shadow-xs placeholder:text-slate-400" />
              <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Masquer le mot de passe" : "Afficher le mot de passe"} className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <Icon name={show ? "eyeOff" : "eye"} />
              </button>
            </span>
          </label>

          {error && (
            <div key={error} role="alert" className="shake flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <button disabled={pending} className="v-btn h-12 w-full text-[15px]">
            {pending ? (
              <><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />Connexion…</>
            ) : (
              <>Se connecter<Icon name="arrow" className="h-4 w-4" /></>
            )}
          </button>

          <p className="pt-2 text-center text-xs text-slate-400">© VOLTAZONE · Le chantier électrique, zone par zone</p>
        </form>
      </section>
    </main>
  );
}