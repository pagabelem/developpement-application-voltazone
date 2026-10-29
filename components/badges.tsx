import type { Lot, WorkStatus } from '@prisma/client'
import { STATUS_LABELS, STATUS_STYLES } from '@/lib/constants'
import { cn } from '@/lib/utils'

export function StatusBadge({ status, className }: { status: WorkStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        STATUS_STYLES[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  )
}

export function LotBadge({ lot, className }: { lot: Lot; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-wide',
        lot === 'CFO' ? 'bg-cfo/15 text-cfo' : 'bg-cfa/15 text-cfa',
        className,
      )}
    >
      {lot}
    </span>
  )
}

export function ProgressBar({
  value,
  lot,
  className,
}: {
  value: number | null
  lot?: Lot
  className?: string
}) {
  const pct = value === null ? 0 : Math.round(value * 100)
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value === null ? undefined : pct}
      aria-label="Avancement"
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div
        className={cn(
          'h-full rounded-full transition-all',
          lot === 'CFO' ? 'bg-cfo' : lot === 'CFA' ? 'bg-cfa' : pct >= 100 ? 'bg-status-done' : 'bg-primary',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
