'use client'
import { useState } from 'react'
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

export type AccountSeries = { id: string; name: string; color: string }

type FilterKey = '1M' | '3M' | '6M' | '1Y' | 'Retirement'
const FILTERS: { key: FilterKey; label: string; months: number }[] = [
  { key: '1M',         label: '1M',         months: 1 },
  { key: '3M',         label: '3M',         months: 3 },
  { key: '6M',         label: '6M',         months: 6 },
  { key: '1Y',         label: '1Y',         months: 12 },
  { key: 'Retirement', label: 'Retirement', months: Infinity },
]

function formatK(value: number) {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`
  if (Math.abs(value) >= 1_000) return `£${(value / 1_000).toFixed(0)}k`
  return `£${value.toFixed(0)}`
}

function fmtGBP(value: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value)
}

type TooltipPayloadItem = { value: number; dataKey: string }

function CustomTooltip({ active, payload, label, accountSeries }: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
  accountSeries: AccountSeries[]
}) {
  if (!active || !payload?.length) return null
  const historical = payload.find(p => p.dataKey === 'netWorth')
  const projected = payload.find(p => p.dataKey === 'projected')
  const isProjected = !historical && !!projected
  const totalValue = historical?.value ?? projected?.value

  const accountItems = accountSeries.flatMap(acc => {
    const hist = payload.find(p => p.dataKey === `h_${acc.id}`)
    const proj = payload.find(p => p.dataKey === `p_${acc.id}`)
    const value = hist?.value ?? proj?.value
    if (value === undefined) return []
    return [{ name: acc.name, value, color: acc.color }]
  })

  return (
    <div className="rounded-xl bg-white border border-slate-200 shadow-lg px-3 py-2 text-sm min-w-40 max-w-56">
      <p className="text-xs text-slate-500 mb-1.5">
        {label}{isProjected ? ' (projected)' : ''}
      </p>
      {totalValue !== undefined && (
        <div className="flex items-center justify-between gap-3 font-semibold text-slate-900 mb-1 pb-1 border-b border-slate-100">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-indigo-600 rounded inline-block" />
            <span className="text-xs text-slate-500">Total</span>
          </div>
          <span>{fmtGBP(totalValue)}</span>
        </div>
      )}
      {accountItems.map(item => (
        <div key={item.name} className="flex items-center justify-between gap-3 py-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="w-2.5 h-0.5 rounded inline-block shrink-0" style={{ background: item.color }} />
            <span className="text-xs text-slate-600 truncate">{item.name}</span>
          </div>
          <span className="text-xs tabular-nums text-slate-900 shrink-0">{fmtGBP(item.value)}</span>
        </div>
      ))}
    </div>
  )
}

export default function NetWorthChart({
  data,
  accountSeries = [],
}: {
  data: Record<string, unknown>[]
  accountSeries?: AccountSeries[]
}) {
  const [filter, setFilter] = useState<FilterKey>('Retirement')

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        Take at least two snapshots, or add income/expenses in Budget to see a projection.
      </div>
    )
  }

  // Split into historical (has netWorth) and pure projected (no netWorth)
  const withHistory = data.filter(d => d.netWorth !== undefined)
  const pureProjected = data.filter(d => d.projected !== undefined && d.netWorth === undefined)
  const hasProjection = pureProjected.length > 0

  // Apply filter — limit how many projected months are shown
  const maxMonths = FILTERS.find(f => f.key === filter)?.months ?? Infinity
  const filteredProjected = pureProjected.slice(0, maxMonths)

  const displayData = [...withHistory, ...filteredProjected]

  // Domain from visible data only
  const allValues: number[] = []
  for (const point of displayData) {
    for (const [key, val] of Object.entries(point)) {
      if (key !== 'label' && typeof val === 'number') allValues.push(val)
    }
  }
  const min = Math.min(...allValues)
  const max = Math.max(...allValues)
  const padding = (max - min) * 0.15 || 1000
  const positive = min >= 0
  const hasAccounts = accountSeries.length > 0

  return (
    <div>
      {/* Filter pills */}
      {hasProjection && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          {FILTERS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                filter === opt.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={displayData} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity={positive ? 0.12 : 0.06} />
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
          <Tooltip content={<CustomTooltip accountSeries={accountSeries} />} />

          {/* Per-category historical lines */}
          {accountSeries.map(acc => (
            <Line
              key={`h_${acc.id}`}
              type="monotone"
              dataKey={`h_${acc.id}`}
              stroke={acc.color}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls={false}
              legendType="none"
              isAnimationActive={false}
            />
          ))}

          {/* Per-category projected lines (dashed) */}
          {accountSeries.map(acc => (
            <Line
              key={`p_${acc.id}`}
              type="monotone"
              dataKey={`p_${acc.id}`}
              stroke={acc.color}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              strokeOpacity={0.55}
              dot={false}
              activeDot={{ r: 3, strokeWidth: 0 }}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          ))}

          {/* Total net worth — bold, on top */}
          <Area
            type="monotone"
            dataKey="netWorth"
            stroke="#4f46e5"
            strokeWidth={hasAccounts ? 2.5 : 2}
            fill="url(#nwGradient)"
            dot={hasAccounts ? false : { fill: '#4f46e5', r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, strokeWidth: 0 }}
            connectNulls={false}
            legendType="none"
            isAnimationActive={false}
          />

          {/* Total projected (dashed) */}
          {hasProjection && (
            <Area
              type="monotone"
              dataKey="projected"
              stroke="#4f46e5"
              strokeWidth={2}
              strokeDasharray="5 3"
              strokeOpacity={0.45}
              fill="none"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fillOpacity: 0.5 }}
              connectNulls
              legendType="none"
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-2">
        <div className="flex items-center gap-1.5">
          <span className="w-5 h-0.5 bg-indigo-600 rounded inline-block" />
          <span className="text-xs text-slate-500">Total</span>
        </div>
        {accountSeries.map(acc => (
          <div key={acc.id} className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 rounded inline-block" style={{ background: acc.color }} />
            <span className="text-xs text-slate-500 truncate max-w-36">{acc.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
