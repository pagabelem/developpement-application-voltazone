"use client";
import { useRef, useState } from "react";

export function DeleteDialog({ action, fields, label, title, message, phrase, className }: {
  action: (fd: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  label: string;
  title: string;
  message: string;
  phrase?: string; // si fourni : l'admin doit taper ce message pour confirmer
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState("");
  const ok = !phrase || typed.trim() === phrase;
  return (
    <>
      <button type="button" onClick={() => { setTyped(""); ref.current?.showModal(); }} className={className ?? "text-xs text-red-600 underline"}>{label}</button>
      <dialog ref={ref} className="m-auto rounded-lg p-0 backdrop:bg-black/50">
        <form action={action} onSubmit={() => ref.current?.close()} className="w-[28rem] max-w-full space-y-3 p-5">
          <h2 className="text-lg font-bold text-red-700">{title}</h2>
          <p className="text-sm text-slate-700">{message}</p>
          <p className="text-xs font-semibold text-red-600">Cette action est définitive.</p>
          {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          {phrase && (
            <label className="block text-sm">
              Pour confirmer, tapez <b>{phrase}</b>
              <input name="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5" />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="rounded border border-slate-300 px-3 py-2 text-sm">Annuler</button>
            <button disabled={!ok} className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-40">Supprimer</button>
          </div>
        </form>
      </dialog>
    </>
  );
}