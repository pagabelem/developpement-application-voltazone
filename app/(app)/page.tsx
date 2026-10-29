import Link from 'next/link'
import { AlertOctagon, Clock } from 'lucide-react'
import { requireUser } from '@/lib/permissions'
import { getDashboard } from '@/lib/data'
import { formatDate, formatPercent } from '@/lib/constants'
import { PageHeader } from '@/components/page-header'
import { KpiCards } from '@/components/dashboard/kpi-cards'
import { ZoneBarsChart } from '@/components/dashboard/zone-bars-chart'
import { StatusDonut } from '@/components/dashboard/status-donut'
import { Heatmap } from '@/components/dashboard/heatmap'
import { ProgressCurve } from '@/components/dashboard/progress-curve'
import { LotBadge } from '@/components/badges'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function DashboardPage() {
  const user = await requireUser()
  const d = await getDashboard(user)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description={`${d.project.name} · avancement global ${formatPercent(d.global.progress, 1)}`}
      />
      <KpiCards global={d.global} cfo={d.cfo} cfa={d.cfa} openIssues={d.totalOpenIssues} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Avancement par zone</CardTitle>
            <CardDescription>Moyenne pondérée des lignes actives, par lot</CardDescription>
          </CardHeader>
          <CardContent>
            <ZoneBarsChart data={d.byZone} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition des statuts</CardTitle>
            <CardDescription>{d.global.total} lignes de suivi</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusDonut counts={d.statusCounts} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Carte de chaleur zone × système</CardTitle>
          <CardDescription>Avancement de chaque système par zone (tous niveaux confondus)</CardDescription>
        </CardHeader>
        <CardContent>
          <Heatmap systems={d.heatmap.systems} zones={d.heatmap.zones} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1.5">
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-status-blocked" aria-hidden />
                Tâches en retard
              </CardTitle>
              <CardDescription>{d.global.late} tâches ont dépassé leur fin prévue</CardDescription>
            </div>
            <Link href="/suivi?retard=1" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Tout voir
            </Link>
          </CardHeader>
          <CardContent>
            {d.late.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun retard. Bravo à l&apos;équipe.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {d.late.map((r) => (
                  <li key={r.id}>
                    <Link href={`/suivi?tache=${r.id}`} className="flex min-h-11 items-center gap-3 py-2 hover:bg-muted/50">
                      <LotBadge lot={r.lot} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{r.title}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{r.code}</span>
                      </span>
                      <span className="text-right text-xs">
                        <span className="block text-status-blocked">fin {formatDate(r.plannedEnd)}</span>
                        <span className="block text-muted-foreground">{formatPercent(r.progress)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div className="flex flex-col gap-1.5">
              <CardTitle className="flex items-center gap-2">
                <AlertOctagon className="size-4 text-status-blocked" aria-hidden />
                Blocages ouverts
              </CardTitle>
              <CardDescription>{d.totalOpenIssues} blocages à lever</CardDescription>
            </div>
            <Link href="/blocages" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Gérer
            </Link>
          </CardHeader>
          <CardContent>
            {d.openIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun blocage ouvert.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {d.openIssues.map((i) => (
                  <li key={i.id}>
                    <Link href={`/suivi?tache=${i.workItemId}`} className="flex min-h-11 items-center gap-3 py-2 hover:bg-muted/50">
                      <LotBadge lot={i.lot} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{i.reason}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          <span className="font-mono">{i.code}</span> · {i.title}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(i.openedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {d.curve.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Courbe d&apos;avancement</CardTitle>
            <CardDescription>Instantanés quotidiens (cron /api/cron/snapshot)</CardDescription>
          </CardHeader>
          <CardContent>
            <ProgressCurve data={d.curve} />
          </CardContent>
        </Card>
      )}
    </div>
  )
}
