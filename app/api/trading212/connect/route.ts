import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { detectMode, syncT212 } from '@/lib/trading212'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { keyId, secret, accountType } = await req.json()
  if (!secret?.trim()) return NextResponse.json({ error: 'Secret key required' }, { status: 400 })

  const resolvedType: 'isa' | 'invest' = accountType === 'invest' ? 'invest' : 'isa'

  try {
    const { mode, authHeader } = await detectMode(keyId ?? '', secret)

    // institution_id encodes both mode and account type:
    //   'demo'   → demo mode (assume ISA for demo)
    //   'isa'    → live Stocks & Shares ISA
    //   'invest' → live Invest account
    const institutionId = mode === 'demo' ? 'demo' : resolvedType

    await supabase.from('connections').delete().eq('user_id', user.id).eq('provider', 'trading212')

    const { data: conn, error } = await supabase
      .from('connections')
      .insert({
        user_id: user.id,
        provider: 'trading212',
        institution_name: 'Trading 212',
        institution_id: institutionId,
        api_key: authHeader,
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
