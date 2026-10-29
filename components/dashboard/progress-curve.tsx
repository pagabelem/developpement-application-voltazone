'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'

const config = {
  global: { label: 'Global', color: 'var(--foreground)' },
  CFO: { label: 'CFO', color: 'var(--cfo)' },
  CFA: { label: 'CFA', color: 'var(--cfa)' },
} satisfies ChartConfig

export function ProgressCurve({ data }: { data: { date: string; global?: number; CFO?: number; CFA?: number }[] }) {
  const rows = data.map((d) => ({
    date: new Date(d.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    global: d.global !== undefined ? Math.round(d.global * 1000) / 10 : undefined,
    CFO: d.CFO !== undefined ? Math.round(d.CFO * 1000) / 10 : undefined,
    CFA: d.CFA !== undefined ? Math.round(d.CFA * 1000) / 10 : undefined,
  }))
  return (
    <ChartContainer config={config} className="aspect-auto h-64 w-full">
      <LineChart data={rows} margin={{ left: -16, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={48} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line dataKey="global" stroke="var(--color-global)" strokeWidth={2} dot={false} />
        <Line dataKey="CFO" stroke="var(--color-CFO)" strokeWidth={2} dot={false} />
        <Line dataKey="CFA" stroke="var(--color-CFA)" strokeWidth={2} dot={false} />
      </LineChart>
    </ChartContainer>
  )
}
