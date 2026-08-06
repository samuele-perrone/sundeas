import { createClient } from '@/lib/supabase/server'
import { calcNetWorth, formatGBP } from '@/lib/finance'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import AddAccountForm from './AddAccountForm'
import AccountRow from './AccountRow'
import Trading212Section from './Trading212Section'
import RecommendationsWidget from '../dashboard/RecommendationsWidget'

const TYPE_LABELS: Record<string, string> = {
  current: 'Current accounts', savings: 'Savings', isa: 'ISAs',
  pension: 'Pensions', investment: 'Investments', mortgage: 'Mortgages',
  credit_card: 'Credit cards', other: 'Other',
}

export default async function AccountsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: accounts }, { data: connections }] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', user!.id).order('created_at', { ascending: true }),
    supabase.from('connections')
      .select('id, provider, institution_name, last_synced_at, connected_at')
      .eq('user_id', user!.id),
  ])

  const totalNetWorth = calcNetWorth(accounts ?? [])

  const t212Connection = (connections ?? []).find(c => c.provider === 'trading212') ?? null
  const t212ConnId = t212Connection?.id

  const connectedAccounts = (accounts ?? []).filter(a => a.connection_id)
  const manualAccounts = (accounts ?? []).filter(a => !a.connection_id)

  // Trading 212 account
  const t212Account = t212ConnId
    ? (accounts ?? []).find(a => a.connection_id === t212ConnId) ?? null
    : null

  // Group manual accounts by type
  const manualByType: Record<string, typeof accounts> = {}
  for (const acc of manualAccounts) {
    if (!manualByType[acc.type]) manualByType[acc.type] = []
    manualByType[acc.type]!.push(acc)
  }

  return (
    <div className="p-10 max-w-3xl">

      {/* Header */}
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Manage your accounts and track balances</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Net worth</p>
          <p className={`text-3xl font-bold tabular-nums ${totalNetWorth < 0 ? 'text-destructive' : 'text-foreground'}`}>
            {formatGBP(totalNetWorth)}
          </p>
        </div>
      </div>

      {/* AI recommendations */}
      <div className="mb-6">
        <RecommendationsWidget />
      </div>

      {/* Trading 212 */}
      <Trading212Section connection={t212Connection} account={t212Account} />

      {/* Manual accounts */}
      {Object.keys(manualByType).length > 0 && (
        <div className="space-y-5 mb-6">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Manual accounts
          </h2>
          {Object.entries(manualByType).map(([type, accs]) => (
            <section key={type} aria-label={TYPE_LABELS[type] ?? type}>
              <p className="text-xs text-muted-foreground mb-2 px-1">{TYPE_LABELS[type] ?? type}</p>
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

      {/* Empty state */}
      {connectedAccounts.length === 0 && manualAccounts.length === 0 && !t212Connection && (
        <Card className="mb-6">
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">No accounts yet — connect Trading 212 or add one manually below.</p>
          </CardContent>
        </Card>
      )}

      {/* Add manual account */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold">Add accounts</h2>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Manual account</CardTitle>
          </CardHeader>
          <CardContent>
            <AddAccountForm userId={user!.id} />
          </CardContent>
        </Card>
      </div>

    </div>
  )
}
