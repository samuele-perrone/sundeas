import { createClient } from '@/lib/supabase/server'
import { toMonthlyAmount, sumByCategory, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import RecurringManager from './RecurringManager'

const TX_CATEGORY_LABELS: Record<string, string> = {
  bill: 'Bills', bills: 'Bills', subscription: 'Subscriptions', subscriptions: 'Subscriptions',
  groceries: 'Groceries', eating_out: 'Eating out', transport: 'Transport',
  salary: 'Salary', transfer: 'Transfers', shopping: 'Shopping',
  entertainment: 'Entertainment', health: 'Health', insurance: 'Insurance', other: 'Other',
}

function txDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default async function BudgetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data: accounts } = await supabase
    .from('accounts')
    .select('id, name, institution_name, type')
    .eq('user_id', user!.id)
    .order('type').order('name')

  const accountIds = (accounts ?? []).map(a => a.id)

  const [{ data: recurring }, { data: transactions }] = await Promise.all([
    supabase.from('recurring_payments').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    accountIds.length > 0
      ? supabase.from('transactions').select('*').in('account_id', accountIds)
          .gte('transacted_at', since.toISOString()).order('transacted_at', { ascending: false }).limit(200)
      : { data: [] },
  ])

  const all = recurring ?? []
  const oneOffItems = all.filter(r => r.frequency === 'once')
  const incomeItems = all.filter(r => r.type === 'income' && r.frequency !== 'once')
  const expenseItems = all.filter(r => r.type === 'expense' && r.frequency !== 'once')
  const transferItems = all.filter(r => r.type === 'transfer')
  const monthlyIncome = incomeItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyExpenses = expenseItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyTransfers = transferItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyNet = monthlyIncome - monthlyExpenses
  const monthlyDisposable = monthlyNet - monthlyTransfers

  const txList = transactions ?? []
  const byCat = sumByCategory(txList)
  const totalSpend = Object.values(byCat).reduce((s, v) => s + v, 0)
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1])

  return (
    <div className="px-4 py-6 md:p-10 max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Budget & cash flow</h1>
        <p className="text-sm text-muted-foreground mt-1">Recurring payments, spending patterns, and monthly flow</p>
      </div>

      {/* Monthly summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-5 pb-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5">Disposable</p>
            <p className={`text-2xl font-bold tabular-nums ${monthlyDisposable >= 0 ? 'text-emerald-600' : 'text-destructive'}`}>
              {monthlyDisposable >= 0 ? '+' : ''}{formatGBP(monthlyDisposable)}
            </p>
            {monthlyTransfers > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">after {formatGBP(monthlyTransfers)} transfers</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recurring payments — money in / money out */}
      <Card>
        <CardContent className="pt-6">
          <RecurringManager
            incomeItems={incomeItems}
            expenseItems={expenseItems}
            transferItems={transferItems}
            oneOffItems={oneOffItems}
            accounts={accounts ?? []}
          />
        </CardContent>
      </Card>

      {/* Spending analysis — last 30 days */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Spending</h2>
          <p className="text-sm text-muted-foreground">Last 30 days</p>
        </div>

        {txList.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No transactions yet. Connect a bank account to see your spending here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Category breakdown */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    By category
                  </CardTitle>
                  {totalSpend > 0 && (
                    <span className="text-sm font-semibold tabular-nums">{formatGBP(totalSpend)} total</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {sortedCats.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No outgoing transactions this period.</p>
                ) : (
                  <ul className="space-y-3" aria-label="Spending by category">
                    {sortedCats.map(([cat, amount]) => {
                      const pct = totalSpend > 0 ? (amount / totalSpend) * 100 : 0
                      return (
                        <li key={cat}>
                          <div className="flex items-center justify-between text-sm mb-1.5">
                            <span className="text-muted-foreground">{TX_CATEGORY_LABELS[cat] ?? cat}</span>
                            <span className="font-semibold tabular-nums">{formatGBP(amount)}</span>
                          </div>
                          <Progress
                            value={pct}
                            className="h-1.5"
                            aria-label={`${TX_CATEGORY_LABELS[cat] ?? cat}: ${Math.round(pct)}% of spend`}
                          />
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Transaction list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  Transactions
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div role="list" aria-label="Transaction list">
                  {txList.map((tx, i) => (
                    <div key={tx.id}>
                      <div role="listitem" className="flex items-center justify-between px-6 py-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium truncate">
                              {tx.merchant_name ?? tx.description ?? 'Unknown'}
                            </p>
                            {tx.is_recurring && (
                              <Badge variant="secondary" className="text-[10px] shrink-0" aria-label="Recurring">
                                Recurring
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {txDate(tx.transacted_at)}
                            {tx.category && ` · ${TX_CATEGORY_LABELS[tx.category] ?? tx.category}`}
                          </p>
                        </div>
                        <p
                          className={`text-sm font-semibold tabular-nums ml-4 shrink-0 ${tx.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                          aria-label={`${tx.amount < 0 ? 'Debit' : 'Credit'}: ${formatGBP(tx.amount)}`}
                        >
                          {formatGBP(tx.amount)}
                        </p>
                      </div>
                      {i < txList.length - 1 && <Separator />}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
