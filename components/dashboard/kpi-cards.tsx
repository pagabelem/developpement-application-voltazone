import { formatPercent } from '@/lib/constants'
import { ProgressBar } from '@/components/badges'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type Summary = {
  progress: number | null
  total: number
  active: number
  done: number
  inProgress: number
  blocked: number
  toCheck: number
  late: number
}

function Kpi({
  label,
  value,
  sub,
  accent,
  bar,
  lot,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  bar?: number | null
  lot?: 'CFO' | 'CFA'
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-2 px-4">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={cn('font-mono text-2xl font-semibold tabular-nums md:text-3xl', accent)}>{value}</span>
        {bar !== undefined && <ProgressBar value={bar} lot={lot} />}
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </CardContent>
    </Card>
  )
}

export function KpiCards({
  global,
  cfo,
  cfa,
  openIssues,
}: {
  global: Summary
  cfo: Summary
  cfa: Summary
  openIssues: number
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Avancement global" value={formatPercent(global.progress, 1)} bar={global.progress} sub={`${global.active} lignes actives`} />
      <Kpi label="Lot CFO" value={formatPercent(cfo.progress, 1)} bar={cfo.progress} lot="CFO" accent="text-cfo" sub={`${cfo.done}/${cfo.active} terminées`} />
      <Kpi label="Lot CFA" value={formatPercent(cfa.progress, 1)} bar={cfa.progress} lot="CFA" accent="text-cfa" sub={`${cfa.done}/${cfa.active} terminées`} />
      <Kpi label="En cours" value={String(global.inProgress)} accent="text-status-progress" sub={`${global.done} terminées`} />
      <Kpi label="Retards" value={String(global.late)} accent={global.late ? 'text-status-blocked' : undefined} sub="fin prévue dépassée" />
      <Kpi label="Blocages ouverts" value={String(openIssues)} accent={openIssues ? 'text-status-blocked' : undefined} sub={`${global.toCheck} à vérifier`} />
    </div>
  )
}
