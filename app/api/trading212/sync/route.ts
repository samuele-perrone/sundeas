import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { syncT212 } from '@/lib/trading212'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { connectionId } = await req.json()
  if (!connectionId) return NextResponse.json({ error: 'connectionId required' }, { status: 400 })

  try {
    const result = await syncT212(supabase, connectionId, user.id)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 })
  }
}
