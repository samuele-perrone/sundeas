import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

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

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: 'Missing email' }, { status: 400 })

  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundeas.com'

  // Generate invite link without sending Supabase's default email
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${appUrl}/api/auth/callback` },
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Auto-approve so they have access immediately on sign-in
  if (data.user) {
    await admin.from('profiles').update({ approved: true }).eq('id', data.user.id)
  }

  const inviteLink = data.properties?.action_link
  const from = process.env.RESEND_FROM ?? 'Sundeas <hello@sundeas.com>'

  await resend.emails.send({
    from,
    to: email,
    subject: "You've been invited to Sundeas",
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700;">Sundeas</span>
        </div>

        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 8px;">You've been invited</h1>
        <p style="color: #64748b; margin: 0 0 24px; font-size: 15px;">
          You've been invited to join Sundeas — a personal wealth management and retirement planning tool.
        </p>

        <a href="${inviteLink}" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">
          Accept invitation →
        </a>

        <p style="color: #64748b; font-size: 14px; margin-top: 24px;">
          Or sign in at <a href="${appUrl}/login" style="color: #0f172a;">${appUrl}/login</a> using your Google account.
        </p>

        <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
          You're receiving this because someone invited you to Sundeas.
          Sundeas provides information only — not regulated financial advice.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
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
