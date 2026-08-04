import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Fetch all accounts across all users
  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, balance, include_in_net_worth')
    .not('balance', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!accounts?.length) return NextResponse.json({ snapshotted: 0 })

  const now = new Date()
  const monthStart = new Date(now)
  monthStart.setUTCDate(1)
  monthStart.setUTCHours(0, 0, 0, 0)
  const monthEnd = new Date(monthStart)
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1)

  await supabase.from('balance_snapshots')
    .delete()
    .in('account_id', accounts.map(a => a.id))
    .gte('snapshotted_at', monthStart.toISOString())
    .lt('snapshotted_at', monthEnd.toISOString())

  const rows = accounts.map(a => ({
    account_id: a.id,
    balance: a.balance,
    snapshotted_at: now.toISOString(),
  }))

  const { error: insertError } = await supabase.from('balance_snapshots').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ snapshotted: rows.length })
}
