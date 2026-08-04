import { createClient } from '@/lib/supabase/server'
import {
  calcNetWorth, calcRetirementProgress, calcYearsToRetirement,
  calcRequiredMonthlySaving, toMonthlyAmount, formatGBP,
} from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ArrowRight, TrendingUp } from 'lucide-react'
import NetWorthChart from './NetWorthChart'
import SnapshotButton from './SnapshotButton'

const TYPE_LABELS: Record<string, string> = {
  current: 'Current', savings: 'Savings', isa: 'ISAs', pension: 'Pensions',
  investment: 'Investments', mortgage: 'Mortgages', credit_card: 'Credit cards', other: 'Other',
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)

  const accountIds = (accounts ?? []).map(a => a.id)

  const [
    { data: profile },
    { data: goal },
    { data: todos },
    { data: snapshots },
    { data: recurring },
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('goals').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('todos').select('*').eq('user_id', user!.id).is('completed_at', null).order('priority').limit(5),
    accountIds.length > 0
      ? supabase.from('balance_snapshots').select('account_id, balance, snapshotted_at').in('account_id', accountIds).order('snapshotted_at', { ascending: true })
      : { data: [] },
    supabase.from('recurring_payments').select('*').eq('user_id', user!.id),
  ])

  const netWorth = calcNetWorth(accounts ?? [])
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)
  const progress = targetLumpSum ? calcRetirementProgress(netWorth, targetLumpSum) : null
  const monthlyRequired = targetLumpSum && yearsLeft !== null
    ? calcRequiredMonthlySaving(netWorth, targetLumpSum, yearsLeft) : null

  const byType: Record<string, number> = {}
  for (const acc of accounts ?? []) {
    if (!acc.include_in_net_worth) continue
    byType[acc.type] = (byType[acc.type] ?? 0) + (acc.balance ?? 0)
  }

  // Monthly net from recurring payments
  const allRecurring = recurring ?? []
  const monthlyIncome = allRecurring.filter(r => r.type === 'income').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyExpenses = allRecurring.filter(r => r.type === 'expense').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyNet = monthlyIncome - monthlyExpenses

  // Build net worth timeline from snapshots (grouped by month)
  const includeIds = new Set((accounts ?? []).filter(a => a.include_in_net_worth).map(a => a.id))
  const byMonth: Record<string, number> = {}
  for (const snap of snapshots ?? []) {
    if (!includeIds.has(snap.account_id)) continue
    const month = snap.snapshotted_at.slice(0, 7)
    byMonth[month] = (byMonth[month] ?? 0) + Number(snap.balance)
  }
  const historicalData = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, nw]) => ({
      label: new Date(month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      netWorth: nw,
    }))

  // Build projected data if recurring payments exist
  type ChartPoint = { label: string; netWorth?: number; projected?: number }
  const chartData: ChartPoint[] = []

  if (allRecurring.length > 0) {
    const projMonths = Math.min((yearsLeft ?? 10) * 12, 120)
    const base = historicalData.length > 0 ? historicalData[historicalData.length - 1].netWorth : netWorth
    const now = new Date()

    // Historical points (last one also gets projected to create visual continuity)
    for (let i = 0; i < historicalData.length; i++) {
      const isLast = i === historicalData.length - 1
      chartData.push({ label: historicalData[i].label, netWorth: historicalData[i].netWorth, ...(isLast ? { projected: historicalData[i].netWorth } : {}) })
    }

    // If no historical data, anchor the projection at today
    if (historicalData.length === 0) {
      const todayLabel = now.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      chartData.push({ label: todayLabel, netWorth, projected: netWorth })
    }

    // Project forward month by month
    for (let m = 1; m <= projMonths; m++) {
      const d = new Date(now.getFullYear(), now.getMonth() + m, 1)
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      chartData.push({ label, projected: Math.round(base + monthlyNet * m) })
    }
  } else {
    chartData.push(...historicalData)
  }

  return (
    <div className="p-10 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-1">Your financial snapshot</p>
      </div>

      {/* Net worth hero */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Total net worth
            </CardTitle>
            <SnapshotButton />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p
              className={`text-4xl font-bold tracking-tight ${netWorth < 0 ? 'text-destructive' : 'text-foreground'}`}
              aria-live="polite"
            >
              {formatGBP(netWorth)}
            </p>
            {allRecurring.length > 0 && (
              <p className={`text-sm mt-1 ${monthlyNet >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {monthlyNet >= 0 ? '+' : ''}{formatGBP(monthlyNet)}/month net from budget
              </p>
            )}
          </div>
          {(accounts ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">
              <Link href="/accounts" className="text-primary underline-offset-4 hover:underline">
                Add your first account
              </Link>{' '}
              to start tracking your net worth.
            </p>
          )}
          <NetWorthChart data={chartData} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Retirement progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Retirement at {targetAge}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {progress !== null ? (
              <>
                <div className="flex items-end justify-between">
                  <p className="text-3xl font-bold tracking-tight">{Math.round(progress)}%</p>
                  <p className="text-sm text-muted-foreground pb-1">{formatGBP(targetLumpSum!)} target</p>
                </div>
                <Progress
                  value={progress}
                  aria-label={`${Math.round(progress)}% of retirement target reached`}
                  className="h-2"
                />
                <div className="flex flex-col gap-1 pt-1">
                  {yearsLeft !== null && (
                    <p className="text-xs text-muted-foreground">{yearsLeft} years remaining</p>
                  )}
                  {monthlyRequired !== null && monthlyRequired > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Save ~{formatGBP(monthlyRequired)}/month to stay on track
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="py-2">
                <p className="text-sm text-muted-foreground">
                  <Link href="/plan" className="text-primary underline-offset-4 hover:underline">
                    Set your retirement goal
                  </Link>{' '}
                  to see progress here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(byType).length === 0 ? (
              <p className="text-sm text-muted-foreground">No accounts yet.</p>
            ) : (
              <ul className="space-y-2" aria-label="Net worth by account type">
                {Object.entries(byType).map(([type, total], i, arr) => (
                  <li key={type}>
                    <div className="flex items-center justify-between text-sm py-1">
                      <span className="text-muted-foreground">{TYPE_LABELS[type] ?? type}</span>
                      <span className={`font-semibold tabular-nums ${total < 0 ? 'text-destructive' : 'text-foreground'}`}>
                        {formatGBP(total)}
                      </span>
                    </div>
                    {i < arr.length - 1 && <Separator />}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action items */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Action items
            </CardTitle>
            <Link
              href="/plan"
              className="text-xs text-primary flex items-center gap-1 hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            >
              View all <ArrowRight className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {(todos ?? []).length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
              No open action items — you&apos;re on track.
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Open action items">
              {(todos ?? []).map(todo => (
                <li key={todo.id} className="flex items-start gap-3">
                  <Badge
                    variant={PRIORITY_VARIANT[todo.priority] ?? 'secondary'}
                    className="mt-0.5 shrink-0 uppercase text-[10px]"
                    aria-label={`Priority: ${todo.priority}`}
                  >
                    {todo.priority}
                  </Badge>
                  <div>
                    <p className="text-sm font-medium leading-snug">{todo.title}</p>
                    {todo.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{todo.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
