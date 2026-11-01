import { requireUser } from "@/lib/session";
import { PageTitle, card } from "@/components/ui";

const STEPS = [
  ["1. Zones", "Renommez les 10 zones d'exemple selon le plan réel du stade et renseignez responsable, effectif prévu et effectif présent du jour."],
  ["2. Tâches", "Page principale du classeur A : créez ou modifiez les tâches, avec dates, lot, quantités et avancement. L'ID (T001…) est généré automatiquement."],
  ["3. Quantités", "Renseignez quantité prévue et réalisée : le reste à faire, l'avancement et le statut se calculent seuls. Sans quantité, l'avancement saisi en % est utilisé. Gardez une unité cohérente (m, u…)."],
  ["4. Suivi (grille)", "Grille plan / site du classeur B : un comptage par zone × niveau × système. Cases jaunes = à saisir, enregistrement automatique."],
  ["5. Planning", "Reprend les tâches ; les dates apparaissent dès qu'elles sont saisies. Les retards sont signalés en rouge."],
  ["6. Équipes", "Remplacez les noms génériques par les vrais chefs d'équipe et affectez-les aux zones. Une alerte signale les zones sans équipe."],
  ["7. Tableau de bord", "Les indicateurs se calculent depuis les données. Le sélecteur « Base de calcul » évite de compter deux fois les mêmes travaux (grille et tâches)."],
  ["8. Partage PDF et Excel", "Rapports → Imprimer / PDF, ou exports Excel et CSV (format des classeurs d'origine). Vérifiez la politique de partage avant envoi."],
];

export default async function AidePage() {
  await requireUser();
  return (
    <div className="max-w-3xl space-y-3">
      <PageTitle>Mode d'emploi</PageTitle>
      {STEPS.map(([t, d]) => <div key={t} className={card}><h2 className="font-semibold">{t}</h2><p className="text-sm text-slate-600">{d}</p></div>)}
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
        Attention : les quantités, équipes, zones et tâches d'exemple ne sont pas des données validées. Confirmez-les avec les plans, le responsable travaux et les études.
      </div>
    </div>
  );
}