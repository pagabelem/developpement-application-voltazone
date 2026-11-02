import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { isManager } from "@/lib/auth/permissions";
import { ImportForm } from "@/components/import-form";
import { PageTitle, card } from "@/components/ui";

export default async function ImportPage() {
  const user = await requireUser();
  if (!isManager(user)) redirect("/dashboard");
  return (
    <div className="max-w-2xl space-y-4">
      <PageTitle sub="Ordre conseillé : A (zones, équipes, tâches), puis B (grille plan / site), puis C (rapport courant faible).">Import Excel</PageTitle>
      <section className={card}>
        <h2 className="mb-2 font-semibold">1. Classeur A — « Modèle Conducteur Travaux Stade CFO/CFA »</h2>
        <ImportForm endpoint="/api/import-a" template="/api/import/template?type=A" />
      </section>
      <section className={card}>
        <h2 className="mb-2 font-semibold">2. Classeur B — « Suivi chantier zones »</h2>
        <ImportForm endpoint="/api/import" template="/api/import/template?type=B" />
      </section>
      <section className={card}>
        <h2 className="mb-2 font-semibold">3. Classeur C — « Rapport chantier courant faible »</h2>
        <ImportForm endpoint="/api/import-c" template="/api/import/template-c" />
      </section>
    </div>
  );
}