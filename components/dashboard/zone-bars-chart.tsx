'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const config = {
  CFO: { label: 'CFO', color: 'var(--cfo)' },
  CFA: { label: 'CFA', color: 'var(--cfa)' },
} satisfies ChartConfig

export function ZoneBarsChart({
  data,
}: {
  data: { code: string; name: string; cfo: number | null; cfa: number | null }[]
}) {
  const rows = data.map((z) => ({
    code: z.code,
    name: z.name,
    CFO: z.cfo === null ? 0 : Math.round(z.cfo * 1000) / 10,
    CFA: z.cfa === null ? 0 : Math.round(z.cfa * 1000) / 10,
  }))
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <BarChart data={rows} margin={{ left: -16, right: 4 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="code" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={48} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, p) => {
                const row = p?.[0]?.payload as { code: string; name: string } | undefined
                return row ? `${row.code} · ${row.name}` : ''
              }}
              formatter={(value, name) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-mono font-medium tabular-nums">{value} %</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="CFO" fill="var(--color-CFO)" radius={[3, 3, 0, 0]} />
        <Bar dataKey="CFA" fill="var(--color-CFA)" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}
