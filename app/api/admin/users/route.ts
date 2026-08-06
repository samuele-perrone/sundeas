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

export async function GET() {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = createAdminClient()
  const { data: { users }, error } = await admin.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profiles } = await admin.from('profiles').select('id, role, approved')
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]))

  const result = users.map(u => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    role: profileMap[u.id]?.role ?? 'user',
    approved: profileMap[u.id]?.approved ?? false,
  }))

  return NextResponse.json(result)
}

export async function PATCH(req: NextRequest) {
  const caller = await requireSuperAdmin()
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, role, approved } = await req.json()
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  // Prevent superadmin from removing their own superadmin role
  if (id === caller.id && role === 'user') {
    return NextResponse.json({ error: 'Cannot demote yourself' }, { status: 400 })
  }

  const admin = createAdminClient()
  const update: Record<string, unknown> = {}
  if (role !== undefined) update.role = role
  if (approved !== undefined) update.approved = approved

  const { error } = await admin.from('profiles').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
