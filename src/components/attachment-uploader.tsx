"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export function AttachmentUploader({ entity, entityId }: { entity: string; entityId: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onChange() {
    const files = ref.current?.files;
    if (!files?.length) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("entity", entity);
    fd.set("entityId", entityId);
    [...files].forEach((f) => fd.append("file", f));
    try {
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? `Erreur ${r.status}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }

  return (
    <div className="text-xs">
      <label className="cursor-pointer rounded border border-slate-300 bg-white px-2 py-1">
        {busy ? "Envoi…" : "+ Photo / PDF"}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={onChange} />
      </label>
      {err && <span className="ml-2 text-red-600">{err}</span>}
    </div>
  );
}