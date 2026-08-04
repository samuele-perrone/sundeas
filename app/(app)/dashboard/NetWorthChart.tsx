'use client'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

type DataPoint = { label: string; netWorth?: number; projected?: number }

function formatK(value: number) {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `£${(value / 1_000).toFixed(0)}k`
  return `£${value.toFixed(0)}`
}

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const historical = payload.find(p => p.dataKey === 'netWorth')
  const projected = payload.find(p => p.dataKey === 'projected')
  const value = historical?.value ?? projected?.value
  if (value === undefined) return null
  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-lg px-3 py-2">
      <p className="text-xs text-slate-500 mb-0.5">
        {label}{projected && !historical ? ' (projected)' : ''}
      </p>
      <p className="text-sm font-semibold text-slate-900">
        {new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value)}
      </p>
    </div>
  )
}

export default function NetWorthChart({ data }: { data: DataPoint[] }) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Take at least two snapshots, or add income/expenses in Budget to see a projection.
      </div>
    )
  }

  const allValues = data.flatMap(d => [d.netWorth, d.projected].filter((v): v is number => v !== undefined))
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const padding = (max - min) * 0.15 || 1000
  const positive = min >= 0
  const hasProjection = data.some(d => d.projected !== undefined)

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity={positive ? 0.15 : 0.08} />
            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={formatK}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          width={48}
          domain={[min - padding, max + padding]}
        />
        <Tooltip content={<CustomTooltip />} />
        {/* Historical */}
        <Area
          type="monotone"
          dataKey="netWorth"
          stroke="#4f46e5"
          strokeWidth={2}
          fill="url(#nwGradient)"
          dot={{ fill: '#4f46e5', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
          connectNulls={false}
        />
        {/* Projected */}
        {hasProjection && (
          <Area
            type="monotone"
            dataKey="projected"
            stroke="#4f46e5"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            strokeOpacity={0.45}
            fill="none"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fillOpacity: 0.5 }}
            connectNulls
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}
