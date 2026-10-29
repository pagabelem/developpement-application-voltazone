import type { WorkStatus } from '@prisma/client'

export type QtyInput = {
  qtyPlanned: number | null
  qtyDone: number | null
}

export type RuleItem = QtyInput & {
  weight: number
  status: WorkStatus
  unit?: string
  plannedEnd?: Date | null
}

/** RG-03 : statut automatique, un blocage ouvert force "Bloqué". */
export function computeStatus({ qtyPlanned, qtyDone }: QtyInput, hasOpenIssue = false): WorkStatus {
  if (hasOpenIssue) return 'BLOQUE'
  if (qtyPlanned === null || qtyPlanned === undefined) return 'NON_RENSEIGNE'
  if (qtyDone === null || qtyDone === undefined) return 'A_VERIFIER'
  if (qtyPlanned === 0) return 'SANS_OBJET'
  if (qtyDone >= qtyPlanned) return 'TERMINE'
  if (qtyDone === 0) return 'A_FAIRE'
  return 'EN_COURS'
}

/** RG-02 : une ligne est active si la quantité prévue est > 0. */
export function isActive({ qtyPlanned }: QtyInput): boolean {
  return qtyPlanned !== null && qtyPlanned !== undefined && qtyPlanned > 0
}

/** RG-01 : avancement = MIN(1, réalisé / prévu), null si prévu vide ou nul. */
export function computeProgress(item: QtyInput): number | null {
  if (!isActive(item)) return null
  return Math.min(1, (item.qtyDone ?? 0) / (item.qtyPlanned as number))
}

/** RG-04 : écart = réalisé − prévu (vide si une des valeurs est vide). */
export function computeGap({ qtyPlanned, qtyDone }: QtyInput): number | null {
  if (qtyPlanned === null || qtyDone === null) return null
  return qtyDone - qtyPlanned
}

/** RG-04 : reste à faire = MAX(0, prévu − réalisé). */
export function computeRemaining({ qtyPlanned, qtyDone }: QtyInput): number | null {
  if (qtyPlanned === null) return null
  return Math.max(0, qtyPlanned - (qtyDone ?? 0))
}

/** RG-08 : dépassement accepté mais signalé. */
export function isOverrun({ qtyPlanned, qtyDone }: QtyInput): boolean {
  return qtyPlanned !== null && qtyDone !== null && qtyPlanned > 0 && qtyDone > qtyPlanned
}

function startOfDay(date: Date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/** RG-06 : retard = fin prévue dépassée et statut différent de Terminé. */
export function isLate(
  item: { plannedEnd?: Date | null; status: WorkStatus },
  now: Date = new Date(),
): boolean {
  if (!item.plannedEnd) return false
  if (item.status === 'TERMINE' || item.status === 'SANS_OBJET') return false
  return new Date(item.plannedEnd) < startOfDay(now)
}

/**
 * RG-05 : moyenne pondérée des lignes actives (poids défaut 1).
 * La méthode "somme des quantités" n'est appliquée que si toutes les lignes ont la même unité.
 */
export function aggregateProgress(
  items: RuleItem[],
  method: 'WEIGHTED_AVERAGE' | 'QUANTITY_SUM' = 'WEIGHTED_AVERAGE',
): number | null {
  const active = items.filter(isActive)
  if (active.length === 0) return null

  if (method === 'QUANTITY_SUM') {
    const units = new Set(active.map((i) => i.unit ?? 'u'))
    if (units.size === 1) {
      const planned = active.reduce((s, i) => s + (i.qtyPlanned as number), 0)
      const done = active.reduce(
        (s, i) => s + Math.min(i.qtyDone ?? 0, i.qtyPlanned as number),
        0,
      )
      return planned > 0 ? done / planned : null
    }
  }

  let weighted = 0
  let totalWeight = 0
  for (const item of active) {
    const w = item.weight > 0 ? item.weight : 1
    weighted += (computeProgress(item) ?? 0) * w
    totalWeight += w
  }
  return totalWeight > 0 ? weighted / totalWeight : null
}

/** RG-07 : dates réelles automatiques. */
export function autoActualDates(
  prev: { actualStart: Date | null; actualEnd: Date | null },
  next: { qtyDone: number | null; status: WorkStatus },
  now: Date = new Date(),
) {
  const result = { actualStart: prev.actualStart, actualEnd: prev.actualEnd }
  if (!prev.actualStart && (next.qtyDone ?? 0) > 0) result.actualStart = now
  if (!prev.actualEnd && next.status === 'TERMINE') result.actualEnd = now
  if (next.status === 'EN_COURS' || next.status === 'A_FAIRE') result.actualEnd = null
  return result
}
