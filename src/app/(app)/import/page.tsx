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
      <PageTitle sub="Importez d'abord le classeur A (zones, équipes, tâches), puis le classeur B (grille plan / site).">Import Excel</PageTitle>
      <section className={card}>
        <h2 className="mb-2 font-semibold">1. Classeur A — « Modèle Conducteur Travaux Stade CFO/CFA »</h2>
<ImportForm endpoint="/api/import-a" template="/api/import/template?type=A" />
      </section>
      <section className={card}>
        <h2 className="mb-2 font-semibold">2. Classeur B — « Suivi chantier zones »</h2>
        <ImportForm endpoint="/api/import" template="/api/import/template?type=B" />
      </section>
    </div>
  );
}