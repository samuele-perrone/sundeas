import { createClient } from '@/lib/supabase/server'
import { calcNetWorth, calcYearsToRetirement, toMonthlyAmount, formatGBP } from '@/lib/finance'
import Link from 'next/link'

function projectBalance(base: number, monthlyNet: number, monthlyRate: number, months: number): number {
  if (Math.abs(monthlyRate) < 1e-10) return base + monthlyNet * months
  const growth = Math.pow(1 + monthlyRate, months)
  return base * growth + (monthlyNet * (growth - 1)) / monthlyRate
}

const TYPE_LABELS: Record<string, string> = {
  pension: 'Pension', savings: 'Savings', isa: 'ISA',
  investment: 'Investments', current: 'Current', other: 'Other',
}

// Types that represent wealth (not debt) — shown in the pot breakdown
const WEALTH_TYPES = new Set(['pension', 'savings', 'isa', 'investment', 'current', 'other'])

export default async function RetirementWidget() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { data: accounts },
    { data: profile },
    { data: goal },
    { data: recurring },
  ] = await Promise.all([
    supabase.from('accounts').select('id, balance, type, interest_rate, include_in_net_worth, is_manual').eq('user_id', user.id),
    supabase.from('profiles').select('date_of_birth, target_retirement_age').eq('id', user.id).single(),
    supabase.from('goals').select('target_lump_sum, target_retirement_age, target_monthly_income').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('recurring_payments').select('type, amount, frequency, account_id, to_account_id, category').eq('user_id', user.id),
  ])

  const all = accounts ?? []
  const netWorth = calcNetWorth(all)
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)

  if (!targetLumpSum || yearsLeft === null || yearsLeft <= 0) {
    return (
      <div className="rounded-xl border border-white/10 px-3 py-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
          Retirement at {targetAge}
        </p>
        <Link href="/plan" className="text-xs text-indigo-400 hover:underline underline-offset-4">
          Set a retirement goal →
        </Link>
      </div>
    )
  }

  const progress = Math.max(-100, Math.min(200, (netWorth / targetLumpSum) * 100))
  const includedAccounts = all.filter(a => a.include_in_net_worth !== false)
  const allRecurring = recurring ?? []

  // Per-account monthly delta
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

  const mortgageIds = new Set(includedAccounts.filter(a => a.type === 'mortgage').map(a => a.id))
  const numMortgages = mortgageIds.size
  const externalMortgagePayment = numMortgages > 0
    ? allRecurring
        .filter(r => r.type === 'expense' && r.category === 'mortgage' && !mortgageIds.has(r.account_id))
        .reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0) / numMortgages
    : 0

  // Project each account to retirement and group by type
  const projectedByType: Record<string, number> = {}
  let projectedAtRetirement = 0

  for (const acc of includedAccounts) {
    const base = acc.balance ?? 0
    const rate = acc.interest_rate ? Math.pow(1 + acc.interest_rate / 100, 1 / 12) - 1 : 0
    const rawDelta = accountMonthlyNet[acc.id] ?? 0
    let delta = rawDelta
    if (base < 0 && rawDelta < 0) delta = -rawDelta
    if (acc.type === 'mortgage' && rawDelta === 0) delta = externalMortgagePayment

    const projected = projectBalance(base, delta, rate, yearsLeft * 12)
    projectedAtRetirement += projected

    if (WEALTH_TYPES.has(acc.type) && projected > 0) {
      projectedByType[acc.type] = (projectedByType[acc.type] ?? 0) + projected
    }
  }

  // Sort pot breakdown by projected value descending
  const potBreakdown = Object.entries(projectedByType)
    .sort((a, b) => b[1] - a[1])

  const gap = targetLumpSum - projectedAtRetirement
  const extraMonthly = gap > 0 ? gap / (yearsLeft * 12) : null
  const lumpEquivalent = extraMonthly !== null ? Math.round((extraMonthly * 12) / 0.05) : null

  // Monthly income at retirement: use goal target if set, otherwise 4% SWR on projected pot
  const targetMonthlyIncome: number | null = goal?.target_monthly_income ?? null
  const projectedMonthlyIncome = projectedAtRetirement > 0
    ? Math.round((projectedAtRetirement * 0.04) / 12)
    : null

  const barWidth = Math.max(0, Math.min(100, progress))
  const onTrack = gap <= 0

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 space-y-2.5">
      {/* Header + progress */}
      <div>
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
          Retirement at {targetAge}
        </p>
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-lg font-bold text-white">{Math.round(progress)}%</span>
          <span className="text-[10px] text-slate-400">{formatGBP(targetLumpSum)} goal</span>
        </div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${onTrack ? 'bg-emerald-400' : 'bg-indigo-400'}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        <p className="text-[10px] text-slate-400 mt-1">{yearsLeft} years remaining</p>
      </div>

      {/* Gap analysis */}
      <div className="border-t border-white/10 pt-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Projected pot</span>
          <span className={`text-[11px] font-semibold tabular-nums ${onTrack ? 'text-emerald-400' : 'text-white'}`}>
            {formatGBP(Math.round(projectedAtRetirement))}
          </span>
        </div>
        {onTrack ? (
          <p className="text-[10px] text-emerald-400">On track — surplus of {formatGBP(Math.round(-gap))}</p>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Still needed</span>
              <span className="text-[11px] font-semibold tabular-nums text-amber-400">
                {formatGBP(Math.round(gap))}
              </span>
            </div>
            {extraMonthly !== null && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-2 py-2 space-y-1">
                <p className="text-[10px] font-medium text-amber-300">To close the gap:</p>
                <p className="text-[10px] text-amber-400">
                  · Save <span className="font-semibold">{formatGBP(Math.round(extraMonthly))}/mo</span> extra
                </p>
                {lumpEquivalent !== null && (
                  <p className="text-[10px] text-amber-400">
                    · Or invest <span className="font-semibold">{formatGBP(lumpEquivalent)}</span> at 5% AER
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Expected monthly income */}
      {projectedMonthlyIncome !== null && (
        <div className="border-t border-white/10 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expected monthly</p>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">Projected income</span>
            <span className="text-[11px] font-semibold tabular-nums text-white">
              {formatGBP(projectedMonthlyIncome)}/mo
            </span>
          </div>
          {targetMonthlyIncome !== null && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Target income</span>
              <span className={`text-[11px] font-semibold tabular-nums ${projectedMonthlyIncome >= targetMonthlyIncome ? 'text-emerald-400' : 'text-amber-400'}`}>
                {formatGBP(targetMonthlyIncome)}/mo
              </span>
            </div>
          )}
          <p className="text-[10px] text-slate-500">Based on 4% annual withdrawal</p>
        </div>
      )}

      {/* Pot breakdown by type */}
      {potBreakdown.length > 0 && (
        <div className="border-t border-white/10 pt-2 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Pot breakdown</p>
          {potBreakdown.map(([type, value]) => (
            <div key={type} className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">{TYPE_LABELS[type] ?? type}</span>
              <span className="text-[11px] font-semibold tabular-nums text-white">
                {formatGBP(Math.round(value))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
