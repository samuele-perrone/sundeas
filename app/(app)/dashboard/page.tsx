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
import { ArrowRight, TrendingUp, PiggyBank, Target, LineChart, MessageCircle, ChevronRight } from 'lucide-react'
import NetWorthChart, { type AccountSeries } from './NetWorthChart'
import SnapshotButton from './SnapshotButton'

const INCOME_CAT: Record<string, string> = {
  salary: 'Salary', dividends: 'Dividends', rental: 'Rental', pension: 'Pension',
  freelance: 'Freelance', benefits: 'Benefits', other: 'Other income',
}
const EXPENSE_CAT: Record<string, string> = {
  rent: 'Rent', mortgage: 'Mortgage', bills: 'Bills', subscriptions: 'Subscriptions',
  insurance: 'Insurance', direct_debit: 'Direct debits', transport: 'Transport',
  childcare: 'Childcare', other: 'Other expenses',
}

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
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? null
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge ?? 57)
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null
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

  // Cash flow breakdown by category (genuine in/out, separate from transfers)
  const groupByCategory = (type: string) =>
    Object.entries(
      allRecurring
        .filter(r => r.type === type)
        .reduce<Record<string, number>>((acc, r) => {
          const cat = r.category ?? 'other'
          acc[cat] = (acc[cat] ?? 0) + toMonthlyAmount(r.amount, r.frequency)
          return acc
        }, {})
    ).sort((a, b) => b[1] - a[1])

  const incomeByCategory = groupByCategory('income')
  const expenseByCategory = groupByCategory('expense')
  const transfers = allRecurring.filter(r => r.type === 'transfer')
  const transferMonthly = transfers.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const accountMap = Object.fromEntries((accounts ?? []).map(a => [a.id, a.name]))

  const includeIds = new Set((accounts ?? []).filter(a => a.include_in_net_worth).map(a => a.id))

  // Per-account base monthly delta — excludes annual payments with a known month (handled per-month in projection)
  const accountMonthlyNet: Record<string, number> = {}
  for (const r of allRecurring) {
    // Annual payments with a payment_month are applied as a lump sum in the right month, not smoothed
    const isAnnualWithMonth = r.frequency === 'annual' && r.payment_month != null
    const monthly = isAnnualWithMonth ? 0 : toMonthlyAmount(r.amount, r.frequency)
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

  // Annual payments that have a specific month — applied as a full lump sum in that calendar month
  const annualByAccount: Record<string, { amount: number; month: number; type: string; to_account_id: string | null }[]> = {}
  for (const r of allRecurring) {
    if (r.frequency === 'annual' && r.payment_month != null) {
      if (!annualByAccount[r.account_id]) annualByAccount[r.account_id] = []
      annualByAccount[r.account_id].push({ amount: r.amount, month: r.payment_month, type: r.type, to_account_id: r.to_account_id ?? null })
    }
  }

  const accountTypeMap: Record<string, string> = {}
  for (const acc of accounts ?? []) accountTypeMap[acc.id] = acc.type

  // Group snapshots by calendar month — latest balance per account per month wins.
  // Multiple snapshots in the same month accumulate in the DB (no deletion),
  // but the chart shows one data point per month using the most recent reading.
  const accountByMonth: Record<string, Record<string, number>> = {}
  for (const snap of (snapshots ?? []).sort((a, b) => a.snapshotted_at.localeCompare(b.snapshotted_at))) {
    if (!includeIds.has(snap.account_id)) continue
    const month = snap.snapshotted_at.slice(0, 7)
    if (!accountByMonth[snap.account_id]) accountByMonth[snap.account_id] = {}
    accountByMonth[snap.account_id][month] = Number(snap.balance)
  }

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

  const allSnapshotTs = [...new Set(Object.values(accountByMonth).flatMap(m => Object.keys(m)))].sort()
  const lastSnapshotTs = allSnapshotTs.at(-1)

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

  // Last known balance per account (from last snapshot month, or current balance)
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
  const projStartDate = lastSnapshotTs ? new Date(lastSnapshotTs + '-01') : now

  // How many projected months have already passed (last snapshot → today)
  // These render as solid extension of the historical line, not dotted.
  const monthsBehind = Math.max(0,
    (now.getFullYear() - projStartDate.getFullYear()) * 12 +
    (now.getMonth() - projStartDate.getMonth())
  )
  // Total projection: past-extension + future
  const projMonths = monthsBehind + Math.min((yearsLeft ?? 10) * 12, 120)

  type ChartPoint = Record<string, string | number | undefined>
  const chartData: ChartPoint[] = []

  // Historical points — one per calendar month (latest snapshot reading for that month)
  for (const month of allSnapshotTs) {
    const point: ChartPoint = {
      label: new Date(month + '-01').toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
      netWorth: Math.round(byMonth[month]),
    }
    for (const type of Object.keys(typeAccounts)) {
      if (typeByMonth[type]?.[month] !== undefined) {
        point[`h_${type}`] = Math.round(typeByMonth[type][month])
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

  const projectedAtRetirement = (yearsLeft !== null && yearsLeft > 0 && includedAccounts.length > 0)
    ? includedAccounts.reduce((total, acc) => {
        return total + projectBalance(
          accountLastBalance[acc.id] ?? 0,
          accountDelta(acc),
          accountMonthlyRate[acc.id] ?? 0,
          yearsLeft * 12,
        )
      }, 0)
    : null

  const gapAtRetirement = (targetLumpSum !== null && projectedAtRetirement !== null)
    ? targetLumpSum - projectedAtRetirement
    : null

  const extraMonthlyToCloseGap = (gapAtRetirement !== null && gapAtRetirement > 0 && yearsLeft)
    ? gapAtRetirement / (yearsLeft * 12)
    : null

  const investmentEquivalent = extraMonthlyToCloseGap !== null
    ? Math.round((extraMonthlyToCloseGap * 12) / 0.05)
    : null

  // Anchor at today if no history but something to project
  if (allSnapshotTs.length === 0 && hasProjection) {
    const todayLabel = now.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
    const point: ChartPoint = { label: todayLabel, netWorth, projected: netWorth }
    for (const [type, accs] of Object.entries(typeAccounts)) {
      const bal = accs.reduce((s, a) => s + (a.balance ?? 0), 0)
      point[`h_${type}`] = bal
      point[`p_${type}`] = bal
    }
    chartData.push(point)
  }

  // Bridge last historical point into the projection only when the snapshot is
  // in the current month (monthsBehind === 0). Otherwise the projection loop
  // handles the solid extension up to today and bridges there.
  if (allSnapshotTs.length > 0 && hasProjection && monthsBehind === 0) {
    const last = chartData[chartData.length - 1]
    last.projected = last.netWorth
    for (const [type, accs] of Object.entries(typeAccounts)) {
      last[`p_${type}`] = accs.reduce((s, a) => s + (accountLastBalance[a.id] ?? 0), 0)
    }
  }

  // Project forward using a running balance simulation.
  // Months between last snapshot and today (m <= monthsBehind) render as a
  // solid extension of the historical line. Months after today (m > monthsBehind)
  // render as a dotted prediction.
  if (hasProjection) {
    const runningBalance: Record<string, number> = {}
    for (const acc of includedAccounts) {
      runningBalance[acc.id] = accountLastBalance[acc.id] ?? 0
    }

    for (let m = 1; m <= projMonths; m++) {
      const d = new Date(projStartDate.getFullYear(), projStartDate.getMonth() + m, 1)
      const calMonth = d.getMonth() + 1 // 1–12
      const label = d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
      const point: ChartPoint = { label }
      let total = 0

      for (const acc of includedAccounts) {
        const rate = accountMonthlyRate[acc.id] ?? 0
        const rawDelta = accountMonthlyNet[acc.id] ?? 0

        let delta = rawDelta
        if (runningBalance[acc.id] < 0 && rawDelta < 0) delta = -rawDelta
        if (acc.type === 'mortgage' && rawDelta === 0) delta += externalMortgagePayment

        runningBalance[acc.id] = runningBalance[acc.id] * (1 + rate) + delta

        for (const annual of (annualByAccount[acc.id] ?? [])) {
          if (annual.month === calMonth) {
            const sign = annual.type === 'income' ? 1 : -1
            runningBalance[acc.id] += sign * annual.amount
          }
        }
        for (const [fromId, annuals] of Object.entries(annualByAccount)) {
          for (const annual of annuals) {
            if (annual.type === 'transfer' && annual.to_account_id === acc.id && annual.month === calMonth) {
              runningBalance[acc.id] += annual.amount
            }
          }
          if (fromId === acc.id) {
            for (const annual of annuals) {
              if (annual.type === 'transfer' && annual.month === calMonth) {
                runningBalance[acc.id] -= annual.amount
              }
            }
          }
        }
      }

      const fallback = Math.round(
        (lastSnapshotTs ? (byMonth[lastSnapshotTs] ?? netWorth) : netWorth) + monthlyNet * m
      )

      if (m <= monthsBehind) {
        // Past months since last snapshot: solid extension of historical line
        for (const [type, accs] of Object.entries(typeAccounts)) {
          const typeVal = accs.reduce((sum, acc) => sum + runningBalance[acc.id], 0)
          point[`h_${type}`] = Math.round(typeVal)
          total += typeVal
        }
        point.netWorth = Math.round(total) || fallback

        if (m === monthsBehind) {
          // Today: bridge — also start the dotted line here
          point.projected = point.netWorth
          for (const [type, accs] of Object.entries(typeAccounts)) {
            point[`p_${type}`] = point[`h_${type}`]
          }
        }
      } else {
        // Future months: dotted prediction
        for (const [type, accs] of Object.entries(typeAccounts)) {
          const typeVal = accs.reduce((sum, acc) => sum + runningBalance[acc.id], 0)
          point[`p_${type}`] = Math.round(typeVal)
          total += typeVal
        }
        point.projected = Math.round(total) || fallback
      }

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
              <span className="font-medium text-foreground">Solid lines</span> — real data from your snapshots, extended to today using your rates and recurring payments.
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Dashed lines</span> — projection from today using each account&apos;s interest rate (compounded monthly) and your recurring payments.
            </p>
            <p className="text-xs text-muted-foreground">
              The <span className="font-medium text-foreground">time filter</span> (1M / 3M / 6M / 1Y / Retirement) controls how far ahead the projection is shown — history always displays in full.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Cash flow */}
      {allRecurring.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Monthly Cash Flow
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Proportional bar */}
            {(monthlyIncome > 0 || monthlyExpenses > 0) && (() => {
              const barTotal = monthlyIncome + monthlyExpenses
              const inPct = barTotal > 0 ? (monthlyIncome / barTotal) * 100 : 50
              return (
                <div className="space-y-1.5">
                  <div className="h-2.5 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500" style={{ width: `${inPct}%` }} />
                    <div className="bg-red-400 flex-1" />
                  </div>
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-emerald-600">+{formatGBP(monthlyIncome)}/mo</span>
                    <span className="text-destructive">-{formatGBP(monthlyExpenses)}/mo</span>
                  </div>
                </div>
              )
            })()}

            {/* Two-column breakdown */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-1">IN</p>
              <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">OUT</p>
              {Array.from({ length: Math.max(incomeByCategory.length, expenseByCategory.length) }).map((_, i) => (
                <>
                  {incomeByCategory[i] ? (
                    <div key={`in-${i}`} className="flex items-baseline justify-between gap-1 py-0.5">
                      <span className="text-xs text-muted-foreground truncate">{INCOME_CAT[incomeByCategory[i][0]] ?? incomeByCategory[i][0]}</span>
                      <span className="text-xs font-medium tabular-nums shrink-0">{formatGBP(incomeByCategory[i][1])}</span>
                    </div>
                  ) : <div key={`in-empty-${i}`} />}
                  {expenseByCategory[i] ? (
                    <div key={`out-${i}`} className="flex items-baseline justify-between gap-1 py-0.5">
                      <span className="text-xs text-muted-foreground truncate">{EXPENSE_CAT[expenseByCategory[i][0]] ?? expenseByCategory[i][0]}</span>
                      <span className="text-xs font-medium tabular-nums shrink-0">{formatGBP(expenseByCategory[i][1])}</span>
                    </div>
                  ) : <div key={`out-empty-${i}`} />}
                </>
              ))}
            </div>

            {/* Transfers */}
            {transfers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">Transfers</p>
                    <span className="text-xs font-medium text-indigo-600 tabular-nums">{formatGBP(transferMonthly)}/mo total</span>
                  </div>
                  {transfers.map(r => {
                    const from = accountMap[r.account_id] ?? 'Unknown'
                    const to = r.to_account_id ? (accountMap[r.to_account_id] ?? 'Unknown') : '—'
                    return (
                      <div key={r.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{r.name}</p>
                          <p className="text-xs text-muted-foreground truncate">{from} → {to}</p>
                        </div>
                        <span className="text-xs font-medium tabular-nums shrink-0 text-indigo-600">{formatGBP(toMonthlyAmount(r.amount, r.frequency))}/mo</span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            <Separator />

            {/* Net */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Net</p>
              <p className={`text-lg font-bold tabular-nums ${monthlyNet >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                {monthlyNet >= 0 ? '+' : ''}{formatGBP(monthlyNet)}
                <span className="text-xs font-normal text-muted-foreground">/mo</span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Retirement progress */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              {targetAge ? `Retirement at ${targetAge}` : 'Retirement'}
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
                  value={Math.min(progress, 100)}
                  aria-label={`${Math.round(progress)}% of retirement target reached`}
                  className="h-2"
                />
                <div className="flex flex-col gap-1 pt-1">
                  {yearsLeft !== null && (
                    <p className="text-xs text-muted-foreground">{yearsLeft} years remaining</p>
                  )}
                </div>

                {/* Gap analysis */}
                {projectedAtRetirement !== null && (
                  <div className="pt-2 border-t border-border space-y-2.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">Projected at retirement</p>
                      <p className={`text-xs font-semibold tabular-nums ${projectedAtRetirement >= targetLumpSum! ? 'text-emerald-600' : 'text-foreground'}`}>
                        {formatGBP(Math.round(projectedAtRetirement))}
                      </p>
                    </div>

                    {gapAtRetirement !== null && gapAtRetirement > 0 ? (
                      <>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">Still needed</p>
                          <p className="text-xs font-semibold tabular-nums text-amber-600">
                            {formatGBP(Math.round(gapAtRetirement))}
                          </p>
                        </div>
                        <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2.5 space-y-1.5">
                          <p className="text-xs font-medium text-amber-800">To close the gap you could:</p>
                          {extraMonthlyToCloseGap !== null && (
                            <p className="text-xs text-amber-700">
                              · Save an extra <span className="font-semibold">{formatGBP(Math.round(extraMonthlyToCloseGap))}/month</span>
                            </p>
                          )}
                          {investmentEquivalent !== null && investmentEquivalent > 0 && (
                            <p className="text-xs text-amber-700">
                              · Invest a lump sum of <span className="font-semibold">{formatGBP(investmentEquivalent)}</span> at 5% AER now
                            </p>
                          )}
                          {extraMonthlyToCloseGap !== null && (
                            <p className="text-xs text-amber-700">
                              · Generate <span className="font-semibold">{formatGBP(Math.round(extraMonthlyToCloseGap))}/month</span> more in passive income or returns
                            </p>
                          )}
                        </div>
                      </>
                    ) : gapAtRetirement !== null && gapAtRetirement <= 0 ? (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 flex items-center gap-2">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                        <p className="text-xs text-emerald-700 font-medium">
                          On track — projected to exceed target by {formatGBP(Math.round(-gapAtRetirement))}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}
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
