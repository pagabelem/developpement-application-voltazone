// Constantes et utilitaires du classeur « Rapport chantier courant faible »

export const POSTES = [
  { key: "CHEMIN", label: "Chemin de câble", short: "Chemin de câble", system: "Tous systèmes" },
  { key: "RJ45_PRISES", label: "Câble RJ45 – prises informatiques", short: "RJ45 prises informatiques", system: "VDI / réseau" },
  { key: "RJ45_CAMERAS", label: "Câble RJ45 – caméras", short: "RJ45 caméras", system: "Vidéosurveillance" },
  { key: "SSI", label: "Câble SSI", short: "Câble SSI", system: "Détection incendie" },
  { key: "SONO", label: "Sonorisation", short: "Sonorisation", system: "Sonorisation" },
  { key: "ACCES", label: "Contrôle d'accès", short: "Contrôle d'accès", system: "Contrôle d'accès" },
];
export const DEFAULT_BUILDINGS = ["Administration + Mosquée", "Futsal", "Restaurant", "Kids club", "Vestiaires"];
export const REPORT_SYSTEMS = ["Câblage VDI / réseau", "Vidéosurveillance", "Contrôle d'accès", "Détection incendie (SSI)", "Sonorisation"];
export const WORK_TYPES = ["Tubage (tubes orange)", "Chemins de câbles", "Tirage de câbles", "Terminaisons / raccordements", "Tests / recette"];
export const NC_LABEL: Record<string, string> = { OUVERT: "Ouvert", EN_COURS: "En cours", LEVE: "Levé" };
export const MATERIAL_LABEL: Record<string, string> = { BROUILLON: "Brouillon", ENVOYEE: "Envoyée", RECUE: "Reçue" };

export const CHECKLIST_DEFAULT: [string, string][] = [
  ["VDI / réseau", "Cheminement conforme aux plans"],
  ["VDI / réseau", "Repérage/étiquetage câbles et prises"],
  ["VDI / réseau", "Rayon de courbure et séparation courant fort/faible"],
  ["VDI / réseau", "Test de certification (rapport Fluke) par lien"],
  ["VDI / réseau", "Brassage baie + mise à la terre"],
  ["Vidéosurveillance", "Position et orientation des caméras selon plan"],
  ["Vidéosurveillance", "Alimentation PoE / switch"],
  ["Vidéosurveillance", "Configuration IP + NVR (durée d'enregistrement)"],
  ["Vidéosurveillance", "Test d'image jour/nuit, champ de vision"],
  ["Contrôle d'accès", "Lecteurs, ventouses/gâches, BP sortie posés"],
  ["Contrôle d'accès", "Câblage centrale + alimentation secourue"],
  ["Contrôle d'accès", "Test badges et droits d'accès"],
  ["Contrôle d'accès", "Asservissement SSI (déverrouillage incendie)"],
  ["Détection incendie", "Détecteurs, DM, diffuseurs posés"],
  ["Détection incendie", "Adressage et repérage"],
  ["Détection incendie", "Test de chaque point"],
  ["Détection incendie", "Vérification des asservissements (désenfumage, portes CF)"],
  ["Sonorisation", "Position des haut-parleurs, lignes 100V"],
  ["Sonorisation", "Calcul de charge / puissance amplis"],
  ["Sonorisation", "Test impédance / isolement par ligne"],
  ["Sonorisation", "Test intelligibilité + réglage par zone"],
  ["Sonorisation", "Priorité message d'évacuation"],
];

// --- Dates (toujours en UTC, à minuit)
export const utcDay = (d: Date = new Date()) => { const x = new Date(d); x.setUTCHours(0, 0, 0, 0); return x; };
export function parseDay(s?: string | null): Date | null {
  if (!s) return null;
  let m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}
export const isoDay = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "");
export const fr = (d: Date | null | undefined) => (d ? d.toLocaleDateString("fr-FR", { timeZone: "UTC" }) : "");
export function mondayOf(d: Date) {
  const x = utcDay(d);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

// --- Calculs
export const totalPct = (prev: number, today: number) => Math.min(100, prev + today); // veille + aujourd'hui, plafonné
export const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
export function numOrNull(v: FormDataEntryValue | null | undefined): number | null {
  if (v == null) return null;
  const t = String(v).trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}
export const projectLine = (p: { name: string; client: string | null; company: string | null }) =>
  `${/^projet/i.test(p.name) ? "" : "Projet "}${p.name}${p.client ? ` (client : ${p.client})` : ""}${p.company ? ` – Société ${p.company}` : ""}`;

// Jours calendaires couverts, sans compter deux fois les périodes qui se chevauchent
export function mergedDays(ps: { start: Date; end: Date }[]) {
  const D = 86400000;
  const s = [...ps].sort((a, b) => a.start.getTime() - b.start.getTime());
  let total = 0, curS: number | null = null, curE = 0;
  for (const p of s) {
    const a = p.start.getTime(), b = p.end.getTime();
    if (curS === null) { curS = a; curE = b; }
    else if (a <= curE + D) curE = Math.max(curE, b);
    else { total += (curE - curS) / D + 1; curS = a; curE = b; }
  }
  if (curS !== null) total += (curE - curS) / D + 1;
  return Math.round(total);
}

// --- Rapprochement des libellés du carnet de chantier
const ALIAS: Record<string, string> = {
  "ssi": "Détection incendie", "détection incendie": "Détection incendie", "détection incendie (ssi)": "Détection incendie",
  "vdi / réseau": "Réseau informatique", "vdi": "Réseau informatique", "câblage vdi / réseau": "Réseau informatique", "réseau informatique": "Réseau informatique",
  "vidéosurveillance": "Vidéosurveillance", "contrôle d'accès": "Contrôle d'accès", "contrôle d’accès": "Contrôle d'accès", "sonorisation": "Sonorisation",
};
export const resolveSystemName = (label: string) => ALIAS[label.trim().toLowerCase()] ?? null;

export function buildingOf(label: string): string | null {
  const s = label.toLowerCase();
  if (s.includes("futsal")) return "Futsal";
  if (s.includes("admin") || s.includes("mosqu")) return "Administration + Mosquée";
  if (s.includes("resto") || s.includes("restaurant")) return "Restaurant";
  if (s.includes("kids")) return "Kids club";
  if (s.includes("vestiaire")) return "Vestiaires";
  return null;
}







// Lit une date Excel sous toutes ses formes : vraie date, numéro de série, texte jj/mm/aaaa ou aaaa-mm-jj
export function excelDate(x: unknown): Date | null | "ERR" {
  if (x == null || x === "") return null;
  if (x instanceof Date) return utcDay(x);
  if (typeof x === "number") {
    if (x < 20000 || x > 80000) return "ERR"; // numéro de série Excel (années 1954 à 2119)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(x) * 86400000);
  }
  const s = String(x).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelDate(Number(s));
  let m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return "ERR";
}