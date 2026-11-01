"use client";
import { useActionState } from "react";
import { login } from "@/lib/actions/auth";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, undefined);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-lg border bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold">VOLTAZONE</h1>
          <p className="text-sm text-slate-500">Le chantier électrique, zone par zone</p>
        </div>
        <input name="email" type="email" required placeholder="E-mail" autoComplete="username" className="h-12 w-full rounded border border-slate-300 px-3" />
        <input name="password" type="password" required placeholder="Mot de passe" autoComplete="current-password" className="h-12 w-full rounded border border-slate-300 px-3" />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={pending} className="h-12 w-full rounded bg-slate-900 font-medium text-white disabled:opacity-50">{pending ? "Connexion…" : "Se connecter"}</button>
      </form>
    </main>
  );
}