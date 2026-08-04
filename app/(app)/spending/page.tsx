import { createClient } from '@/lib/supabase/server'
import { sumByCategory, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Progress } from '@/components/ui/progress'

const CATEGORY_LABELS: Record<string, string> = {
  bill: 'Bills', bills: 'Bills', subscription: 'Subscriptions',
  groceries: 'Groceries', eating_out: 'Eating out', transport: 'Transport',
  salary: 'Salary', transfer: 'Transfers', shopping: 'Shopping',
  entertainment: 'Entertainment', health: 'Health', other: 'Other',
}

function txDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default async function SpendingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const since = new Date()
  since.setDate(since.getDate() - 30)

  const { data: accounts } = await supabase.from('accounts').select('id').eq('user_id', user!.id)
  const accountIds = (accounts ?? []).map(a => a.id)

  const { data: transactions } = accountIds.length > 0
    ? await supabase
        .from('transactions')
        .select('*')
        .in('account_id', accountIds)
        .gte('transacted_at', since.toISOString())
        .order('transacted_at', { ascending: false })
        .limit(200)
    : { data: [] }

  const txList = transactions ?? []
  const byCat = sumByCategory(txList)
  const totalSpend = Object.values(byCat).reduce((s, v) => s + v, 0)
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1])
  const sorted = [...txList].sort(
    (a, b) => new Date(b.transacted_at).getTime() - new Date(a.transacted_at).getTime()
  )

  return (
    <div className="p-10 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Spending</h1>
        <p className="text-sm text-muted-foreground mt-1">Last 30 days</p>
      </div>

      {txList.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No transactions yet. Connect a bank account or add transactions manually.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Category summary */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  By category
                </CardTitle>
                {totalSpend > 0 && (
                  <span className="text-sm font-semibold tabular-nums">
                    {formatGBP(totalSpend)} total
                  </span>
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
                          <span className="text-muted-foreground">{CATEGORY_LABELS[cat] ?? cat}</span>
                          <span className="font-semibold tabular-nums">{formatGBP(amount)}</span>
                        </div>
                        <Progress
                          value={pct}
                          className="h-1.5"
                          aria-label={`${CATEGORY_LABELS[cat] ?? cat}: ${Math.round(pct)}% of spend`}
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
                {sorted.map((tx, i) => (
                  <div key={tx.id}>
                    <div
                      role="listitem"
                      className="flex items-center justify-between px-6 py-3"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {tx.merchant_name ?? tx.description ?? 'Unknown'}
                          </p>
                          {tx.is_recurring && (
                            <Badge variant="secondary" className="text-[10px]" aria-label="Recurring">
                              Recurring
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {txDate(tx.transacted_at)}
                          {tx.category && ` · ${CATEGORY_LABELS[tx.category] ?? tx.category}`}
                        </p>
                      </div>
                      <p
                        className={`text-sm font-semibold tabular-nums ml-4 shrink-0 ${tx.amount < 0 ? 'text-destructive' : 'text-emerald-600'}`}
                        aria-label={`${tx.amount < 0 ? 'Debit' : 'Credit'}: ${formatGBP(tx.amount)}`}
                      >
                        {formatGBP(tx.amount)}
                      </p>
                    </div>
                    {i < sorted.length - 1 && <Separator />}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
