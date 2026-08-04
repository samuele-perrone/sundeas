import { createClient } from '@/lib/supabase/server'
import { calcNetWorth, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import AddAccountForm from './AddAccountForm'
import AccountRow from './AccountRow'
import SyncRatesButton from './SyncRatesButton'

const TYPE_LABELS: Record<string, string> = {
  current: 'Current accounts',
  savings: 'Savings',
  isa: 'ISAs',
  pension: 'Pensions',
  investment: 'Investments',
  mortgage: 'Mortgages',
  credit_card: 'Credit cards',
  other: 'Other',
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: true })

  const totalNetWorth = calcNetWorth(accounts ?? [])

  const byType: Record<string, typeof accounts> = {}
  for (const acc of accounts ?? []) {
    if (!byType[acc.type]) byType[acc.type] = []
    byType[acc.type]!.push(acc)
  }

  return (
    <div className="p-10 max-w-3xl">

      {/* Page header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Manage your accounts and track balances</p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="text-right">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Net worth</p>
            <p className={`text-3xl font-bold tabular-nums ${totalNetWorth < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatGBP(totalNetWorth)}
            </p>
          </div>
          <SyncRatesButton />
        </div>
      </div>

      {/* Account groups */}
      {Object.keys(byType).length === 0 ? (
        <Card className="mb-6">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No accounts yet — add your first one below.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5 mb-6">
          {Object.entries(byType).map(([type, accs]) => (
            <section key={type} aria-label={TYPE_LABELS[type] ?? type}>
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                {TYPE_LABELS[type] ?? type}
              </h2>
              <Card>
                <CardContent className="p-0">
                  {accs!.map((acc, i) => (
                    <div key={acc.id}>
                      <AccountRow acc={acc} />
                      {i < accs!.length - 1 && <Separator />}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}

      {/* Add account */}
      <Card>
        <CardHeader>
          <CardTitle>Add account</CardTitle>
        </CardHeader>
        <CardContent>
          <AddAccountForm userId={user!.id} />
        </CardContent>
      </Card>

    </div>
  )
}
