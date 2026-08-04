import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date } = await req.json().catch(() => ({}))
  const snapshotted_at = date ? new Date(date).toISOString() : new Date().toISOString()

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, balance')
    .eq('user_id', user.id)
    .not('balance', 'is', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!accounts?.length) return NextResponse.json({ snapshotted: 0 })

  const rows = accounts.map(a => ({
    account_id: a.id,
    balance: a.balance,
    snapshotted_at,
  }))

  const { error: insertError } = await supabase.from('balance_snapshots').insert(rows)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ snapshotted: rows.length })
}
