"use client";
import { Icon } from "@/components/icons";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"><Icon name="alert" /></span>
        <h2 className="font-display text-lg font-bold text-slate-900">Une erreur est survenue</h2>
      </div>
      <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error.message}</p>
      <button onClick={reset} className="v-btn">Réessayer</button>
    </div>
  );
}