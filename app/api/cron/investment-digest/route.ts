import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendDigestForUser } from '@/lib/digest'

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const targetUserId = req.nextUrl.searchParams.get('userId')

  let query = admin.from('profiles').select('id').eq('approved', true)
  if (targetUserId) query = query.eq('id', targetUserId)
  const { data: profiles } = await query

  if (!profiles?.length) return NextResponse.json({ sent: 0 })

  const { data: { users } } = await admin.auth.admin.listUsers()
  const emailMap = Object.fromEntries(users.map(u => [u.id, u.email]))

  let sent = 0
  const errors: string[] = []

  for (const profile of profiles) {
    const email = emailMap[profile.id]
    if (!email) continue
    try {
      await sendDigestForUser(profile.id, email)
      sent++
    } catch (e) {
      errors.push(`${email}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  return NextResponse.json({ sent, errors })
}
