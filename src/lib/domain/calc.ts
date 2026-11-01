// Règles de gestion RG-01 à RG-06 + logique du classeur A (module pur)
export type StatusKey = "NON_RENSEIGNE" | "A_VERIFIER" | "A_FAIRE" | "EN_COURS" | "TERMINE" | "BLOQUE" | "SANS_OBJET";

export const STATUS_LABEL: Record<string, string> = {
  NON_RENSEIGNE: "Non renseigné",
  A_VERIFIER: "À vérifier",
  A_FAIRE: "À faire",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
  BLOQUE: "Bloqué",
  SANS_OBJET: "Sans objet",
};

type Basis = { qtyPlanned: number | null; qtyDone: number | null; manualProgress?: number | null };

export function computeStatus(p: Basis & { blocked?: boolean }): StatusKey {
  const { qtyPlanned: pl, qtyDone: dn, manualProgress: mp } = p;
  if (p.blocked) return "BLOQUE";
  if (pl == null) {
    // tâche sans quantité (classeur A) : statut déduit de l'avancement saisi
    if (mp == null) return "NON_RENSEIGNE";
    return mp >= 100 ? "TERMINE" : mp > 0 ? "EN_COURS" : "A_FAIRE";
  }
  if (pl === 0) return "SANS_OBJET";
  if (dn == null) return "A_VERIFIER";
  if (dn >= pl) return "TERMINE";
  if (dn === 0) return "A_FAIRE";
  return "EN_COURS";
}

// Avancement d'une ligne de la grille (classeur B) : vide si « Sur site » vide
export function rowProgress(pl: number | null, dn: number | null): number | null {
  if (pl == null || pl <= 0 || dn == null) return null;
  return Math.min(1, dn / pl);
}

// Avancement d'une ligne ou tâche : quantités si elles existent, sinon % saisi à la main (0-100)
export function itemProgress(i: Basis): number | null {
  const pl = i.qtyPlanned;
  if (pl != null && pl > 0) return Math.min(1, (i.qtyDone ?? 0) / pl);
  if (pl == null && i.manualProgress != null) return Math.max(0, Math.min(1, i.manualProgress / 100));
  return null;
}

export const ecart = (pl: number | null, dn: number | null) => (pl == null || dn == null ? null : dn - pl);
export const reste = (pl: number | null, dn: number | null) => (pl == null ? null : Math.max(0, pl - (dn ?? 0)));

// « Jours prévus » du classeur A : fin − début + 1
export function daysPlanned(start: Date | null, end: Date | null) {
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}

export function isLate(plannedEnd: Date | null, status: string) {
  if (!plannedEnd || status === "TERMINE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return plannedEnd.getTime() < today.getTime();
}

type Agg = Basis & { weight: number; unit: string };

// RG-02 / RG-05
export function aggregate(items: Agg[], method: string = "MOYENNE"): number | null {
  const act = items.filter((i) => itemProgress(i) !== null);
  if (!act.length) return null;
  const byQty = act.every((i) => (i.qtyPlanned ?? 0) > 0);
  if (method === "SOMME" && byQty && act.every((i) => i.unit === act[0].unit)) {
    const pl = act.reduce((s, i) => s + (i.qtyPlanned ?? 0), 0);
    const dn = act.reduce((s, i) => s + (i.qtyDone ?? 0), 0);
    return Math.min(1, dn / pl);
  }
  let w = 0, s = 0;
  for (const i of act) {
    w += i.weight;
    s += i.weight * (itemProgress(i) ?? 0);
  }
  return w > 0 ? s / w : null;
}