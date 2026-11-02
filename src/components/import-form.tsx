"use client";
import { useEffect, useState } from "react";

type Res = { mode: "preview" | "commit"; error?: string; imported?: number; rows?: number; errors?: { line: number; msg: string }[]; summary?: string[]; newZones?: string[]; newLevels?: string[]; newSystems?: string[] };

export function ImportForm({ endpoint, template }: { endpoint: string; template?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [res, setRes] = useState<Res | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);

  async function call(mode: "preview" | "commit"): Promise<Res> {
    const fd = new FormData();
    fd.set("file", file as File);
    fd.set("mode", mode);
    try {
      const r = await fetch(endpoint, { method: "POST", body: fd });
      if (!(r.headers.get("content-type") ?? "").includes("application/json"))
        return { mode, error: r.status === 404 ? `Route introuvable (${endpoint}) : vérifiez que le fichier route.ts existe dans src/app${endpoint}/.` : `Réponse inattendue du serveur (HTTP ${r.status}). Regardez le terminal où tourne « npm run dev ».` };
      return { mode, ...(await r.json()) };
    } catch (e) {
      return { mode, error: "Impossible de joindre le serveur : " + (e instanceof Error ? e.message : String(e)) };
    }
  }

  async function run(kind: "preview" | "import") {
    if (!file) return setRes({ mode: "preview", error: "Choisissez d'abord un fichier .xlsx." });
    setBusy(kind);
    setRes(null);
    const p = await call("preview"); // « Importer » vérifie d'abord, puis importe s'il n'y a aucune erreur
    setRes(kind === "preview" || p.error || (p.errors?.length ?? 0) > 0 ? p : await call("commit"));
    setBusy(null);
  }

  const btn = "rounded px-3 py-2 text-sm disabled:opacity-50";
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {template
          ? <a href={template} className="rounded border border-blue-300 bg-blue-50 px-3 py-2 font-medium text-blue-800">⬇ Télécharger le modèle Excel</a>
          : <span className="text-slate-500">Utilisez votre classeur Excel d'origine tel quel.</span>}
        <span className="text-xs text-slate-400">{ready ? "Interface prête" : "Chargement de l'interface…"}</span>
      </div>
      <input type="file" accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRes(null); }} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => run("preview")} className={`${btn} border border-slate-300 bg-white`}>{busy === "preview" ? "Analyse…" : "Prévisualiser (vérifier sans enregistrer)"}</button>
        <button type="button" disabled={busy !== null} onClick={() => run("import")} className={`${btn} bg-slate-900 text-white`}>{busy === "import" ? "Import en cours…" : "Importer"}</button>
      </div>
      {res?.error && <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">{res.error}</p>}
      {res && !res.error && (
        <div className="rounded border bg-white p-3 text-sm">
          {res.mode === "commit" ? <p className="font-semibold text-green-700">{res.imported} ligne(s) importée(s).</p> : (
            <>
              <p><b>{res.rows}</b> ligne(s) lues · <b>{res.errors?.length ?? 0}</b> erreur(s){(res.errors?.length ?? 0) === 0 && <span className="ml-2 text-green-700">Aucune erreur : cliquez « Importer ».</span>}</p>
              {res.summary && res.summary.length > 0 && <p>{res.summary.join(" · ")}</p>}
              {res.newZones && res.newZones.length > 0 && <p>Zones à créer : {res.newZones.join(", ")}</p>}
              {res.newLevels && res.newLevels.length > 0 && <p>Niveaux à créer : {res.newLevels.join(", ")}</p>}
              {res.newSystems && res.newSystems.length > 0 && <p>Systèmes à créer : {res.newSystems.join(", ")}</p>}
              <ul className="mt-2 list-disc pl-5 text-red-600">{res.errors?.slice(0, 30).map((e, i) => <li key={i}>{e.line ? `Ligne ${e.line} : ` : ""}{e.msg}</li>)}</ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}