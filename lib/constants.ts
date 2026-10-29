import type { Lot, Role, WorkStatus } from '@prisma/client'

export const STATUS_LABELS: Record<WorkStatus, string> = {
  NON_RENSEIGNE: 'Non renseigné',
  A_VERIFIER: 'À vérifier',
  SANS_OBJET: 'Sans objet',
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  TERMINE: 'Terminé',
  BLOQUE: 'Bloqué',
}

export const STATUS_ORDER: WorkStatus[] = [
  'A_FAIRE',
  'EN_COURS',
  'TERMINE',
  'BLOQUE',
  'A_VERIFIER',
  'NON_RENSEIGNE',
  'SANS_OBJET',
]

/** Classes Tailwind par statut : gris / bleu / vert / rouge / jaune. */
export const STATUS_STYLES: Record<WorkStatus, string> = {
  NON_RENSEIGNE: 'bg-status-neutral/15 text-muted-foreground border-status-neutral/30',
  SANS_OBJET: 'bg-status-neutral/10 text-muted-foreground border-status-neutral/20',
  A_FAIRE: 'bg-status-neutral/20 text-foreground border-status-neutral/40',
  EN_COURS: 'bg-status-progress/15 text-status-progress border-status-progress/30',
  TERMINE: 'bg-status-done/15 text-status-done border-status-done/30',
  BLOQUE: 'bg-status-blocked/15 text-status-blocked border-status-blocked/30',
  A_VERIFIER: 'bg-status-check/20 text-status-check-foreground border-status-check/40',
}

export const STATUS_CHART_COLORS: Record<WorkStatus, string> = {
  NON_RENSEIGNE: 'var(--status-neutral)',
  SANS_OBJET: 'var(--muted)',
  A_FAIRE: 'var(--status-neutral)',
  EN_COURS: 'var(--status-progress)',
  TERMINE: 'var(--status-done)',
  BLOQUE: 'var(--status-blocked)',
  A_VERIFIER: 'var(--status-check)',
}

export const LOT_LABELS: Record<Lot, string> = {
  CFO: 'CFO · Courant fort',
  CFA: 'CFA · Courant faible',
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  CONDUCTEUR: 'Conducteur de travaux',
  CHEF_CFO: "Chef d'équipe CFO",
  CHEF_CFA: "Chef d'équipe CFA",
  CLIENT: 'Client / MOA',
}

export const UNITS = ['u', 'm', 'ens.'] as const

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${(value * 100).toFixed(digits)} %`
}

export function formatQty(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function formatDate(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(
    new Date(value),
  )
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
