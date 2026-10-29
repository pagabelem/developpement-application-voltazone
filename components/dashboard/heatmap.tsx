import Link from 'next/link'
import type { Lot } from '@prisma/client'
import { formatPercent } from '@/lib/constants'
import { cn } from '@/lib/utils'

function cellStyle(value: number | null, lot: Lot) {
  if (value === null) return { className: 'bg-muted/40 text-muted-foreground' }
  const alpha = 0.12 + value * 0.78
  return {
    className: value >= 0.6 ? 'text-white' : 'text-foreground',
    style: { background: `color-mix(in oklch, var(--${lot === 'CFO' ? 'cfo' : 'cfa'}) ${Math.round(alpha * 100)}%, transparent)` },
  }
}

export function Heatmap({
  systems,
  zones,
}: {
  systems: { id: string; name: string; lot: Lot }[]
  zones: { id: string; code: string; name: string; cells: (number | null)[] }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] border-separate border-spacing-1 text-xs">
        <caption className="sr-only">Avancement par zone et par système</caption>
        <thead>
          <tr>
            <th scope="col" className="w-40 text-left font-medium text-muted-foreground">
              Zone
            </th>
            {systems.map((s) => (
              <th key={s.id} scope="col" className="h-20 align-bottom font-medium">
                <span
                  className={cn(
                    'mx-auto block max-h-20 rotate-180 text-left [writing-mode:vertical-rl]',
                    s.lot === 'CFO' ? 'text-cfo' : 'text-cfa',
                  )}
                >
                  {s.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {zones.map((z) => (
            <tr key={z.id}>
              <th scope="row" className="text-left font-normal">
                <Link href={`/zones/${z.id}`} className="block truncate hover:underline">
                  <span className="font-mono font-semibold">{z.code}</span>{' '}
                  <span className="text-muted-foreground">{z.name}</span>
                </Link>
              </th>
              {z.cells.map((v, i) => {
                const s = cellStyle(v, systems[i].lot)
                return (
                  <td
                    key={systems[i].id}
                    className={cn('h-9 min-w-12 rounded text-center font-mono tabular-nums', s.className)}
                    style={s.style}
                    title={`${z.code} · ${systems[i].name} : ${formatPercent(v)}`}
                  >
                    {v === null ? '—' : Math.round(v * 100)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Valeurs en %</span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-cfo" aria-hidden /> CFO
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-cfa" aria-hidden /> CFA
        </span>
        <span>— = sans objet / non renseigné</span>
      </p>
    </div>
  )
}
