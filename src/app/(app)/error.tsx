"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="max-w-xl space-y-3 rounded-lg border border-red-300 bg-red-50 p-4">
      <h2 className="font-semibold text-red-800">Une erreur est survenue</h2>
      <p className="text-sm text-red-700">{error.message}</p>
      <button onClick={reset} className="rounded bg-red-600 px-3 py-2 text-sm text-white">Réessayer</button>
    </div>
  );
}