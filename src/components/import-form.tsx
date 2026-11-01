"use client";
import { useState } from "react";

export function ImportForm({ endpoint, template }: { endpoint: string; template: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function send(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setRes(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("mode", mode);
      const r = await fetch(endpoint, { method: "POST", body: fd });
      if (!(r.headers.get("content-type") ?? "").includes("application/json")) {
        setRes({ mode, error: r.status === 404 ? `Route introuvable (${endpoint}) : vérifiez que le fichier route.ts existe dans src/app${endpoint}/.` : `Réponse inattendue du serveur (HTTP ${r.status}). Regardez le terminal où tourne « npm run dev ».` });
      } else {
        setRes({ mode, ...(await r.json()) });
      }
    } catch (e) {
      setRes({ mode, error: "Impossible de joindre le serveur : " + (e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
    }
  }

  const previewOk = res?.mode === "preview" && !res.error && res.errors?.length === 0;

  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li><a href={template} className="font-medium text-blue-700 underline">Télécharger le modèle Excel</a> (pré-rempli avec vos données actuelles) et le compléter.</li>
        <li>Choisir le fichier, puis <b>Prévisualiser</b> : le fichier est vérifié, <u>rien n'est enregistré</u>.</li>
        <li><b>Importer</b> s'active quand la prévisualisation ne trouve aucune erreur.</li>
      </ol>
      <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
      <div className="flex gap-2">
        <button disabled={!file || busy} onClick={() => send("preview")} className="rounded border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50">{busy && res === null ? "Analyse…" : "Prévisualiser"}</button>
        <button disabled={!previewOk || busy} onClick={() => send("commit")} className="rounded bg-slate-900 px-3 py-2 text-sm text-white disabled:opacity-50">Importer</button>
      </div>
      {res?.error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{res.error}</p>}
      {res && !res.error && (
        <div className="rounded border bg-white p-3 text-sm">
          {res.mode === "commit" ? <p className="font-semibold text-green-700">{res.imported} ligne(s) importée(s).</p> : (
            <>
              <p><b>{res.rows}</b> ligne(s) lues · <b>{res.errors.length}</b> erreur(s){previewOk && <span className="ml-2 text-green-700">Aucune erreur : vous pouvez importer.</span>}</p>
              {res.summary?.length > 0 && <p>{res.summary.join(" · ")}</p>}
              {res.newZones?.length > 0 && <p>Zones à créer : {res.newZones.join(", ")}</p>}
              {res.newLevels?.length > 0 && <p>Niveaux à créer : {res.newLevels.join(", ")}</p>}
              {res.newSystems?.length > 0 && <p>Systèmes à créer : {res.newSystems.join(", ")}</p>}
              <ul className="mt-2 list-disc pl-5 text-red-600">{res.errors.slice(0, 30).map((e: any, i: number) => <li key={i}>{e.line ? `Ligne ${e.line} : ` : ""}{e.msg}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}