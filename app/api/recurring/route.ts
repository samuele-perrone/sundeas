import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, amount, frequency, type, category, account_id, to_account_id, payment_date } = await req.json()

  const { data, error } = await supabase
    .from('recurring_payments')
    .insert({ user_id: user.id, account_id, name, amount, frequency, type, category: category ?? null, to_account_id: to_account_id ?? null, payment_date: payment_date ?? null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
