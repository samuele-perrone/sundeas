import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, balances } = await req.json().catch(() => ({}))
  const snapshotted_at = date ? new Date(date).toISOString() : new Date().toISOString()

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, balance')
    .eq('user_id', user.id)
    .not('balance', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!accounts?.length) return NextResponse.json({ snapshotted: 0 })

  // Delete any existing snapshots for these accounts in the same calendar month
  // so taking a snapshot twice in a month replaces rather than duplicates.
  const monthStart = new Date(snapshotted_at)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  await supabase.from('balance_snapshots')
    .delete()
    .in('account_id', accounts.map(a => a.id))
    .gte('snapshotted_at', monthStart.toISOString())
    .lt('snapshotted_at', monthEnd.toISOString())

  // Use caller-supplied balances when provided (historical entry), otherwise current balance
  const customBalances = balances as Record<string, number> | undefined
  const rows = accounts.map(a => ({
    account_id: a.id,
    balance: customBalances?.[a.id] !== undefined ? customBalances[a.id] : a.balance,
    snapshotted_at,
  }))

  const { error: insertError } = await supabase.from('balance_snapshots').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ snapshotted: rows.length })
}
