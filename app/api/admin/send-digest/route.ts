import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'superadmin') return null
  return user
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const admin = createAdminClient()
  const { data: { users } } = await admin.auth.admin.listUsers()
  const target = users.find(u => u.id === userId)
  if (!target?.email) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Delegate to the cron route internally by calling it with CRON_SECRET
  // but scoped to a single user — easier to just re-use the cron logic inline
  // via a targeted call to the cron endpoint
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundeas.com'
  const res = await fetch(`${appUrl}/api/cron/investment-digest?userId=${userId}`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  })

  if (!res.ok) return NextResponse.json({ error: 'Digest failed' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
