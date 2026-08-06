import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMode, syncT212 } from '@/lib/trading212'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { keyId, secret } = await req.json()
  if (!secret?.trim()) return NextResponse.json({ error: 'Secret key required' }, { status: 400 })

  try {
    const { mode, authHeader } = await detectMode(keyId ?? '', secret)

    await supabase.from('connections').delete().eq('user_id', user.id).eq('provider', 'trading212')

    const { data: conn, error } = await supabase
      .from('connections')
      .insert({
        user_id: user.id,
        provider: 'trading212',
        institution_name: 'Trading 212',
        institution_id: mode,
        api_key: authHeader, // store the exact format that worked
      })
      .select('id')
      .single()

    if (error || !conn) throw new Error(error?.message ?? 'Failed to save connection')

    const result = await syncT212(supabase, conn.id, user.id)
    return NextResponse.json({ ok: true, balance: result.balance })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 400 })
  }
}
