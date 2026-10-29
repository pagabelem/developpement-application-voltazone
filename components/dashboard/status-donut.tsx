'use client'

import { Cell, Pie, PieChart } from 'recharts'
import type { WorkStatus } from '@prisma/client'
import { STATUS_CHART_COLORS, STATUS_LABELS, STATUS_ORDER } from '@/lib/constants'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

export function StatusDonut({ counts }: { counts: Record<string, number> }) {
  const data = STATUS_ORDER.filter((s) => counts[s]).map((s) => ({
    status: s,
    label: STATUS_LABELS[s],
    value: counts[s],
    fill: STATUS_CHART_COLORS[s],
  }))
  const total = data.reduce((s, d) => s + d.value, 0)
  const config = Object.fromEntries(
    STATUS_ORDER.map((s) => [s, { label: STATUS_LABELS[s], color: STATUS_CHART_COLORS[s] }]),
  ) satisfies ChartConfig

  return (
    <div className="flex flex-col gap-4">
      <ChartContainer config={config} className="relative mx-auto aspect-square h-52">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="status" hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="status" innerRadius="62%" outerRadius="95%" strokeWidth={2} stroke="var(--card)">
            {data.map((d) => (
              <Cell key={d.status} fill={d.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ background: d.fill }} />
            <span className="flex-1 truncate text-muted-foreground">{STATUS_LABELS[d.status as WorkStatus]}</span>
            <span className="font-mono tabular-nums">{d.value}</span>
          </li>
        ))}
      </ul>
      <p className="sr-only">Total : {total} lignes</p>
    </div>
  )
}
