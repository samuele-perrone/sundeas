import { createClient } from '@/lib/supabase/server'
import { toMonthlyAmount, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import RecurringList from './RecurringList'

const TYPE_LABELS: Record<string, string> = {
  current: 'Current', savings: 'Savings', isa: 'ISA', pension: 'Pension',
  investment: 'Investment', mortgage: 'Mortgage', credit_card: 'Credit card', other: 'Other',
}

export default async function BudgetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: recurring }] = await Promise.all([
    supabase.from('accounts').select('id, name, institution_name, type').eq('user_id', user!.id).order('type').order('name'),
    supabase.from('recurring_payments').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
  ])

  const byAccount: Record<string, typeof recurring> = {}
  for (const item of recurring ?? []) {
    if (!byAccount[item.account_id]) byAccount[item.account_id] = []
    byAccount[item.account_id]!.push(item)
  }

  const all = recurring ?? []
  const monthlyIncome = all.filter(r => r.type === 'income').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyExpenses = all.filter(r => r.type === 'expense').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyNet = monthlyIncome - monthlyExpenses

  return (
    <div className="p-10 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget & cash flow</h1>
        <p className="text-sm text-muted-foreground mt-1">Track income and recurring expenses to project your future net worth</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Monthly income</p>
            <p className="text-2xl font-bold text-emerald-600 tabular-nums">{formatGBP(monthlyIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Monthly expenses</p>
            <p className="text-2xl font-bold text-destructive tabular-nums">{formatGBP(monthlyExpenses)}</p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-accent/30">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Net per month</p>
            <p className={`text-2xl font-bold tabular-nums ${monthlyNet >= 0 ? 'text-foreground' : 'text-destructive'}`}>
              {monthlyNet >= 0 ? '+' : ''}{formatGBP(monthlyNet)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Per-account recurring payments */}
      <div className="space-y-4">
        {(accounts ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Add accounts first to track recurring payments.
            </CardContent>
          </Card>
        ) : (
          (accounts ?? []).map((account, i, arr) => {
            const items = byAccount[account.id] ?? []
            const accIncome = items.filter(r => r.type === 'income').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
            const accExpenses = items.filter(r => r.type === 'expense').reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
            const accNet = accIncome - accExpenses

            return (
              <Card key={account.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <CardTitle className="text-sm font-semibold">
                        {account.institution_name ? `${account.institution_name} — ` : ''}{account.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">{TYPE_LABELS[account.type] ?? account.type}</p>
                    </div>
                    {items.length > 0 && (
                      <span className={`text-xs font-semibold tabular-nums shrink-0 ${accNet >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
                        {accNet >= 0 ? '+' : ''}{formatGBP(accNet)}/mo
                      </span>
                    )}
                  </div>
                </CardHeader>
                {(i < arr.length - 1 || items.length > 0) && (
                  <div className="px-6">
                    <Separator />
                  </div>
                )}
                <CardContent className="pt-4">
                  <RecurringList accountId={account.id} items={items} />
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
