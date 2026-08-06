import { createClient } from '@/lib/supabase/server'
import {
  calcNetWorth, calcYearsToRetirement, toMonthlyAmount, formatGBP,
} from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ArrowRight, TrendingUp, PiggyBank, Target, LineChart, MessageCircle, ChevronRight } from 'lucide-react'
import NetWorthChart, { type AccountSeries } from './NetWorthChart'
import SnapshotButton from './SnapshotButton'

const TYPE_LABELS: Record<string, string> = {
  current: 'Current', savings: 'Savings', isa: 'ISAs', pension: 'Pensions',
  investment: 'Investments', mortgage: 'Mortgages', credit_card: 'Credit cards', other: 'Other',
}

const TYPE_COLORS: Record<string, string> = {
  current: '#0891b2', savings: '#059669', isa: '#7c3aed',
  pension: '#d97706', investment: '#0284c7', mortgage: '#dc2626',
  credit_card: '#ea580c', other: '#6b7280',
}

// Future value: lump sum + regular contributions, compounded monthly
// FV = PV·(1+r)^n + PMT·((1+r)^n − 1)/r
function projectBalance(base: number, monthlyNet: number, monthlyRate: number, months: number): number {
  if (Math.abs(monthlyRate) < 1e-10) return base + monthlyNet * months
  const growth = Math.pow(1 + monthlyRate, months)
  return base * growth + (monthlyNet * (growth - 1)) / monthlyRate
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
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)

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

  const includeIds = new Set((accounts ?? []).filter(a => a.include_in_net_worth).map(a => a.id))

  // Per-account monthly delta (income/expense/transfers each affect specific accounts)
  const accountMonthlyNet: Record<string, number> = {}
  for (const r of allRecurring) {
    const monthly = toMonthlyAmount(r.amount, r.frequency)
    if (r.type === 'income') {
      accountMonthlyNet[r.account_id] = (accountMonthlyNet[r.account_id] ?? 0) + monthly
    } else if (r.type === 'expense') {
      accountMonthlyNet[r.account_id] = (accountMonthlyNet[r.account_id] ?? 0) - monthly
    } else if (r.type === 'transfer') {
      accountMonthlyNet[r.account_id] = (accountMonthlyNet[r.account_id] ?? 0) - monthly
      if (r.to_account_id) {
        accountMonthlyNet[r.to_account_id] = (accountMonthlyNet[r.to_account_id] ?? 0) + monthly
      }
    }
  }

  // Snapshots: keep only the LAST balance per account per month (snapshots ordered ASC)
  const accountByMonth: Record<string, Record<string, number>> = {}
  const accountTypeMap: Record<string, string> = {}
  for (const acc of accounts ?? []) accountTypeMap[acc.id] = acc.type

  for (const snap of snapshots ?? []) {
    if (!includeIds.has(snap.account_id)) continue
    const month = snap.snapshotted_at.slice(0, 7)
    if (!accountByMonth[snap.account_id]) accountByMonth[snap.account_id] = {}
    accountByMonth[snap.account_id][month] = Number(snap.balance)
  }

  // Derive byMonth and typeByMonth from the already-deduplicated accountByMonth so that
  // multiple snapshots for the same account in the same month are never double-counted.
  const byMonth: Record<string, number> = {}
  const typeByMonth: Record<string, Record<string, number>> = {}
  for (const [accId, months] of Object.entries(accountByMonth)) {
    const type = accountTypeMap[accId]
    for (const [month, bal] of Object.entries(months)) {
      byMonth[month] = (byMonth[month] ?? 0) + bal
      if (type) {
        if (!typeByMonth[type]) typeByMonth[type] = {}
        typeByMonth[type][month] = (typeByMonth[type][month] ?? 0) + bal
      }
    }
  }

  const allHistMonths = [...new Set(Object.values(accountByMonth).flatMap(m => Object.keys(m)))].sort()
  const lastHistMonth = allHistMonths.at(-1)

  const includedAccounts = (accounts ?? []).filter(a => a.include_in_net_worth)

  // Group accounts by type for category-level chart series
  const typeAccounts: Record<string, typeof includedAccounts> = {}
  for (const acc of includedAccounts) {
    if (!typeAccounts[acc.type]) typeAccounts[acc.type] = []
    typeAccounts[acc.type].push(acc)
  }

  const categorySeries: AccountSeries[] = Object.keys(typeAccounts).map(type => ({
    id: type,
    name: TYPE_LABELS[type] ?? type,
    color: TYPE_COLORS[type] ?? '#6b7280',
  }))

  // Last known balance per account (from last snapshot, or current balance)
  const accountLastBalance: Record<string, number> = {}
  for (const acc of includedAccounts) {
    const months = accountByMonth[acc.id]
    if (months && Object.keys(months).length > 0) {
      const sorted = Object.keys(months).sort()
      accountLastBalance[acc.id] = months[sorted[sorted.length - 1]]
    } else {
      accountLastBalance[acc.id] = acc.balance ?? 0
    }
  }

  const now = new Date()
  const projMonths = Math.min((yearsLeft ?? 10) * 12, 120)
  const projStartStr = lastHistMonth ?? now.toISOString().slice(0, 7)
  const projStartDate = new Date(projStartStr + '-01')

  type ChartPoint = Record<string, string | number | undefined>
  const chartData: ChartPoint[] = []

  // Historical points — one value per category per month
  for (const month of allHistMonths) {
    const point: ChartPoint = {
      label: new Date(month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      netWorth: byMonth[month],
    }
    for (const type of Object.keys(typeAccounts)) {
      if (typeByMonth[type]?.[month] !== undefined) {
        point[`h_${type}`] = typeByMonth[type][month]
      }
    }
    chartData.push(point)
  }

  // Project if any account has a rate, or any recurring payments exist
  const hasProjection = allRecurring.length > 0 || includedAccounts.some(a => a.interest_rate && a.interest_rate > 0)

  // Per-account monthly rate (AER → monthly compound rate)
  const accountMonthlyRate: Record<string, number> = {}
  for (const acc of includedAccounts) {
    const annual = Number(acc.interest_rate ?? 0)
    accountMonthlyRate[acc.id] = annual > 0 ? Math.pow(1 + annual / 100, 1 / 12) - 1 : 0
  }

  // Mortgage payments entered as expenses on OTHER accounts (e.g. current account, category='mortgage')
  // These aren't captured in accountMonthlyNet for the mortgage account, so detect them separately.
  const mortgageAccountIds = new Set(includedAccounts.filter(a => a.type === 'mortgage').map(a => a.id))
  const numMortgages = mortgageAccountIds.size
  const externalMortgagePayment = numMortgages > 0
    ? allRecurring
        .filter(r => r.type === 'expense' && r.category === 'mortgage' && !mortgageAccountIds.has(r.account_id))
        .reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0) / numMortgages
    : 0

  // Project each account to retirement using the same FV logic as the chart
  function accountDelta(acc: (typeof includedAccounts)[number]): number {
    const rawDelta = accountMonthlyNet[acc.id] ?? 0
    if (acc.balance != null && acc.balance < 0 && rawDelta < 0) return -rawDelta
    if (acc.type === 'mortgage' && rawDelta === 0) return externalMortgagePayment
    return rawDelta
  }

  // Anchor at today if no history but something to project
  if (allHistMonths.length === 0 && hasProjection) {
    const todayLabel = now.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    const point: ChartPoint = { label: todayLabel, netWorth, projected: netWorth }
    for (const [type, accs] of Object.entries(typeAccounts)) {
      const bal = accs.reduce((s, a) => s + (a.balance ?? 0), 0)
      point[`h_${type}`] = bal
      point[`p_${type}`] = bal
    }
    chartData.push(point)
  }

  // Bridge last historical point into the projection
  if (allHistMonths.length > 0 && hasProjection) {
    const last = chartData[chartData.length - 1]
    last.projected = last.netWorth
    for (const [type, accs] of Object.entries(typeAccounts)) {
      last[`p_${type}`] = accs.reduce((s, a) => s + (accountLastBalance[a.id] ?? 0), 0)
    }
  }

  // Project forward — each account compounds individually, summed per category
  if (hasProjection) {
    for (let m = 1; m <= projMonths; m++) {
      const d = new Date(projStartDate.getFullYear(), projStartDate.getMonth() + m, 1)
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      const point: ChartPoint = { label }
      let total = 0
      for (const [type, accs] of Object.entries(typeAccounts)) {
        const typeVal = accs.reduce((sum, acc) => {
          const base = accountLastBalance[acc.id] ?? 0
          const rate = accountMonthlyRate[acc.id] ?? 0
          const rawDelta = accountMonthlyNet[acc.id] ?? 0

          let delta: number
          if (base < 0 && rawDelta < 0) {
            // Expense directly on a negative-balance account (e.g. expense on mortgage account):
            // this is a debt payment — flip sign so it pushes balance toward 0.
            delta = -rawDelta
          } else {
            // Transfer in (already positive → reduces negative balance correctly),
            // regular positive-balance accounts, or no payment.
            delta = rawDelta
          }
          // If no payment is directly linked to a mortgage account, look for expenses
          // entered on other accounts with category='mortgage' (most common pattern).
          if (acc.type === 'mortgage' && rawDelta === 0) {
            delta += externalMortgagePayment
          }
          return sum + projectBalance(base, delta, rate, m)
        }, 0)
        point[`p_${type}`] = Math.round(typeVal)
        total += typeVal
      }
      point.projected = Math.round(total) || Math.round(
        (lastHistMonth ? (byMonth[lastHistMonth] ?? netWorth) : netWorth) + monthlyNet * m
      )
      chartData.push(point)
    }
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
            <SnapshotButton
              lastSnapshotAt={(snapshots ?? []).at(-1)?.snapshotted_at ?? null}
              accounts={(accounts ?? []).map(a => ({
                id: a.id,
                name: a.name,
                institution_name: a.institution_name,
                type: a.type,
                balance: a.balance,
              }))}
            />
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
          <NetWorthChart data={chartData} accountSeries={categorySeries} />
          <div className="border-t border-border pt-3 space-y-1">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Solid lines</span> — actual balance snapshots you&apos;ve taken. Take a snapshot each month to build up real history.
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Dashed lines</span> — projection from your last snapshot using each account&apos;s interest rate (compounded monthly) and your recurring payments.
            </p>
            <p className="text-xs text-muted-foreground">
              The <span className="font-medium text-foreground">time filter</span> (1M / 3M / 6M / 1Y / Retirement) controls how far ahead the projection is shown — history always displays in full.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Getting started — shown when no accounts exist */}
      {(accounts ?? []).length === 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Get started in 4 steps</CardTitle>
            <p className="text-sm text-muted-foreground mt-0.5">Sundeas helps you track your wealth, plan for retirement, and get AI-powered insights — all in one place.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {[
                {
                  step: '1',
                  icon: PiggyBank,
                  title: 'Add your accounts',
                  description: 'Add bank accounts, ISAs, pensions, investments, and mortgages. Enter balances manually — no bank login required.',
                  href: '/accounts',
                  cta: 'Go to Accounts',
                },
                {
                  step: '2',
                  icon: Target,
                  title: 'Set your retirement goal',
                  description: 'Tell Sundeas when you want to retire and how much you need. The dashboard will project whether you\'re on track.',
                  href: '/plan',
                  cta: 'Set a goal',
                },
                {
                  step: '3',
                  icon: LineChart,
                  title: 'Take a monthly snapshot',
                  description: 'Once your accounts are added, hit "Snapshot" each month. Over time this builds your net worth history and projection.',
                  href: '/accounts',
                  cta: 'Add accounts first',
                },
                {
                  step: '4',
                  icon: MessageCircle,
                  title: 'Ask the AI advisor',
                  description: 'Chat with your personal finance advisor to explore ISA allowances, pension contributions, investment ideas, and more.',
                  href: '/advisor',
                  cta: 'Open advisor',
                },
              ].map(({ step, icon: Icon, title, description, href, cta }) => (
                <Link key={step} href={href} className="flex items-start gap-4 px-6 py-5 hover:bg-muted/40 transition-colors group">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold mt-0.5">
                    {step}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <p className="text-sm font-semibold">{title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-primary shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {cta} <ChevronRight className="w-3 h-3" />
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
