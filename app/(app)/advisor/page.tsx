import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { CheckCircle2, Circle, MessageSquare } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import ChatUI from './ChatUI'

const STEPS = [
  {
    key: 'account',
    label: 'Add at least one account',
    description: 'Track your balances and net worth.',
    href: '/accounts',
    cta: 'Go to Accounts',
  },
  {
    key: 'income',
    label: 'Add an income source',
    description: 'Add your salary or other regular income in Budget.',
    href: '/budget',
    cta: 'Go to Budget',
  },
  {
    key: 'goal',
    label: 'Save your retirement goal',
    description: 'Set a target lump sum or monthly income in the Retirement plan.',
    href: '/plan',
    cta: 'Go to Plan',
  },
]

export default async function AdvisorPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: income }, { data: goals }] = await Promise.all([
    supabase.from('accounts').select('id').eq('user_id', user!.id).limit(1),
    supabase.from('recurring_payments').select('id').eq('user_id', user!.id).eq('type', 'income').limit(1),
    supabase.from('goals').select('id').eq('user_id', user!.id).limit(1),
  ])

  const done = {
    account: (accounts ?? []).length > 0,
    income: (income ?? []).length > 0,
    goal: (goals ?? []).length > 0,
  }

  const ready = done.account && done.income && done.goal

  if (ready) return <ChatUI />

  const completed = Object.values(done).filter(Boolean).length

  return (
    <div className="p-10 max-w-lg">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
          <MessageSquare className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial advisor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Complete your setup to unlock</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 pb-2">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-medium">Setup progress</p>
            <p className="text-sm text-muted-foreground tabular-nums">{completed} / {STEPS.length}</p>
          </div>

          {/* Progress bar */}
          <div className="h-1.5 bg-muted rounded-full mb-6 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(completed / STEPS.length) * 100}%` }}
              aria-hidden="true"
            />
          </div>

          <ul className="space-y-4 pb-3">
            {STEPS.map(step => {
              const isDone = done[step.key as keyof typeof done]
              return (
                <li key={step.key} className="flex items-start gap-3">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-px" aria-label="Complete" />
                  ) : (
                    <Circle className="w-5 h-5 text-muted-foreground/40 shrink-0 mt-px" aria-label="Incomplete" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${isDone ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {step.label}
                    </p>
                    {!isDone && (
                      <>
                        <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                        <Link
                          href={step.href}
                          className="inline-block mt-1.5 text-xs text-primary hover:underline underline-offset-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                        >
                          {step.cta} →
                        </Link>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground mt-4">
        Once set up, the advisor uses your live data to give specific, personalised financial guidance.
      </p>
    </div>
  )
}
