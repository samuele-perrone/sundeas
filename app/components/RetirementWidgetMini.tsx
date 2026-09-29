import { createClient } from '@/lib/supabase/server'
import { calcNetWorth, calcYearsToRetirement, calcRequiredMonthlySaving, formatGBP } from '@/lib/finance'
import Link from 'next/link'

export default async function RetirementWidgetMini() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [
    { data: accounts },
    { data: profile },
    { data: goal },
  ] = await Promise.all([
    supabase.from('accounts').select('id, balance, type, is_manual, include_in_net_worth').eq('user_id', user.id),
    supabase.from('profiles').select('date_of_birth, target_retirement_age').eq('id', user.id).single(),
    supabase.from('goals').select('target_lump_sum, target_retirement_age').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).single(),
  ])

  const all = accounts ?? []
  const netWorth = calcNetWorth(all)
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null

  if (!targetLumpSum || yearsLeft === null || yearsLeft <= 0) {
    return (
      <Link
        href="/plan"
        className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground hover:bg-accent transition-colors"
      >
        <span className="font-medium">Set a retirement goal</span>
        <span aria-hidden="true">→</span>
      </Link>
    )
  }

  const progress = Math.max(0, Math.min(100, (netWorth / targetLumpSum) * 100))
  const monthlyNeeded = calcRequiredMonthlySaving(netWorth, targetLumpSum, yearsLeft)

  return (
    <Link
      href="/plan"
      className="block rounded-xl border border-border bg-card px-4 py-3 hover:bg-accent transition-colors"
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Retire at {targetAge}
        </p>
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-bold text-foreground">{Math.round(progress)}%</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{yearsLeft} yrs left</span>
        </div>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
        <div
          className="h-full rounded-full transition-all bg-indigo-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Save <span className="font-semibold text-foreground">{formatGBP(monthlyNeeded)}/mo</span> to reach {formatGBP(targetLumpSum)} goal
      </p>
    </Link>
  )
}
