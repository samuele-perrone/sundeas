import { createClient } from '@/lib/supabase/server'
import { calcNetWorth, calcRetirementProgress, calcYearsToRetirement, calcRequiredMonthlySaving, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import GoalForm from './GoalForm'
import TodoList from './TodoList'

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: accounts },
    { data: profile },
    { data: goal },
    { data: todos },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user!.id),
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
    supabase.from('goals').select('*').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('todos').select('*').eq('user_id', user!.id).order('priority').order('created_at'),
  ])

  const netWorth = calcNetWorth(accounts ?? [])
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)
  const progress = targetLumpSum ? calcRetirementProgress(netWorth, targetLumpSum) : null
  const monthlyRequired = targetLumpSum && yearsLeft !== null
    ? calcRequiredMonthlySaving(netWorth, targetLumpSum, yearsLeft) : null

  return (
    <div className="px-4 py-6 md:p-10 max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Retirement plan</h1>
        <p className="text-sm text-muted-foreground mt-1">Track your progress to financial independence</p>
      </div>

      {/* Progress card */}
      {progress !== null && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Progress to retiring at {targetAge}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-end justify-between">
              <p className="text-4xl font-bold tracking-tight">{Math.round(progress)}%</p>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Current</p>
                <p className="text-lg font-semibold tabular-nums">{formatGBP(netWorth)}</p>
              </div>
            </div>

            <Progress
              value={Math.min(100, progress)}
              className="h-3"
              aria-label={`${Math.round(progress)}% of retirement target reached`}
            />

            <dl className="grid grid-cols-3 gap-4 pt-1">
              <div className="text-center">
                <dt className="text-xs text-muted-foreground mb-1">Target</dt>
                <dd className="text-sm font-semibold tabular-nums">{formatGBP(targetLumpSum!)}</dd>
              </div>
              <div className="text-center">
                <dt className="text-xs text-muted-foreground mb-1">Gap</dt>
                <dd className={`text-sm font-semibold tabular-nums ${targetLumpSum! - netWorth > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {formatGBP(Math.max(0, targetLumpSum! - netWorth))}
                </dd>
              </div>
              <div className="text-center">
                <dt className="text-xs text-muted-foreground mb-1">Years left</dt>
                <dd className="text-sm font-semibold">{yearsLeft ?? '—'}</dd>
              </div>
            </dl>

            {monthlyRequired !== null && monthlyRequired > 0 && (
              <>
                <Separator />
                <p className="text-sm text-muted-foreground">
                  Save approximately{' '}
                  <strong className="text-foreground tabular-nums">{formatGBP(monthlyRequired)}/month</strong>{' '}
                  to reach your target by age {targetAge}.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Goal form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {goal ? 'Update goal' : 'Set your retirement goal'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GoalForm userId={user!.id} existingGoal={goal ?? null} profile={profile ?? null} />
        </CardContent>
      </Card>

      {/* Todos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Action items</CardTitle>
        </CardHeader>
        <CardContent>
          <TodoList userId={user!.id} todos={todos ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
