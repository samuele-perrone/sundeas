import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Get all users with their emails from auth
  const { data: { users }, error } = await supabase.auth.admin.listUsers()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundeas.com'
  const from = process.env.RESEND_FROM ?? 'Sundeas <digest@sundeas.com>'
  const month = new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })

  let sent = 0
  const errors: string[] = []

  for (const user of users) {
    if (!user.email) continue
    try {
      await resend.emails.send({
        from,
        to: user.email,
        subject: `Sundeas — Time to update your balances (${month})`,
        html: `
          <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
            <div style="margin-bottom: 24px;">
              <span style="font-size: 20px; font-weight: 700;">Sundeas</span>
            </div>

            <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 8px;">Monthly balance reminder</h1>
            <p style="color: #64748b; margin: 0 0 24px; font-size: 15px;">
              It's time to update your account balances and take a snapshot for ${month}.
              Keeping your balances up to date ensures your net worth chart and retirement projections stay accurate.
            </p>

            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
              <p style="margin: 0 0 12px; font-size: 14px; font-weight: 500;">Your monthly checklist:</p>
              <ul style="margin: 0; padding-left: 20px; color: #475569; font-size: 14px; line-height: 2;">
                <li>Update balances on manual accounts</li>
                <li>Check your Trading 212 portfolio is synced</li>
                <li>Take a net worth snapshot</li>
                <li>Review your retirement plan progress</li>
              </ul>
            </div>

            <a href="${appUrl}/accounts" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;">
              Update my balances →
            </a>

            <p style="color: #94a3b8; font-size: 12px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px;">
              You're receiving this because you have a Sundeas account.
              Sundeas provides information only — not regulated financial advice.
            </p>
          </div>
        `,
      })
      sent++
    } catch (e) {
      errors.push(`${user.email}: ${e instanceof Error ? e.message : 'unknown error'}`)
    }
  }

  return NextResponse.json({ sent, errors })
}
