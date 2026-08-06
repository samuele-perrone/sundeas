import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const uid = user.id

  // Delete in dependency order; accounts cascade to snapshots/transactions
  await admin.from('chat_messages').delete().eq('user_id', uid)
  await admin.from('digests').delete().eq('user_id', uid)
  await admin.from('todos').delete().eq('user_id', uid)
  await admin.from('recurring_payments').delete().eq('user_id', uid)
  await admin.from('accounts').delete().eq('user_id', uid)
  await admin.from('connections').delete().eq('user_id', uid)
  await admin.from('goals').delete().eq('user_id', uid)

  return NextResponse.json({ ok: true })
}
