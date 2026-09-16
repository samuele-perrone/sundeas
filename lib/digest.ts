import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { Resend } from 'resend'

const anthropic = new Anthropic()
const resend = new Resend(process.env.RESEND_API_KEY)

const LIVE_BASE = 'https://live.trading212.com/api/v0'
const DEMO_BASE = 'https://demo.trading212.com/api/v0'

type T212Position = {
  ticker: string
  quantity: number
  averagePrice: number
  currentPrice: number
  ppl: number
}

const TYPE_LABELS: Record<string, string> = {
  current: 'Current', savings: 'Savings', isa: 'ISA',
  pension: 'Pension', investment: 'Investment', mortgage: 'Mortgage',
  credit_card: 'Credit card', other: 'Other',
}

const TYPE_COLORS: Record<string, string> = {
  current: '#0891b2', savings: '#059669', isa: '#7c3aed',
  pension: '#d97706', investment: '#0284c7', mortgage: '#dc2626',
  credit_card: '#ea580c', other: '#6b7280',
}

async function fetchT212Portfolio(apiKey: string, mode: string): Promise<T212Position[]> {
  const base = mode === 'demo' ? DEMO_BASE : LIVE_BASE
  const res = await fetch(`${base}/equity/portfolio`, {
    headers: { Authorization: apiKey },
    cache: 'no-store',
  })
  if (!res.ok) return []
  return res.json() as Promise<T212Position[]>
}

async function fetchT212Cash(apiKey: string, mode: string) {
  const base = mode === 'demo' ? DEMO_BASE : LIVE_BASE
  const res = await fetch(`${base}/equity/account/cash`, {
    headers: { Authorization: apiKey },
    cache: 'no-store',
  })
  if (!res.ok) return null
  return res.json() as Promise<{ total: number; invested: number; ppl: number; free: number }>
}

function t212ToYahoo(ticker: string): string {
  return ticker.replace(/_(EQ|US|UK|DE|FR|NL|IT|ES|AU|CA)$/, '')
}

function fmtGBP(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
}

function fmtGBPExact(n: number) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(n)
}

export async function sendDigestForUser(userId: string, email: string): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundeas.com'
  const from = process.env.RESEND_FROM ?? 'Sundeas <digest@sundeas.com>'

  const now = new Date()
  // Fetch snapshots from last 6 months to compute implied savings rate
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const [
    { data: accounts },
    { data: goal },
    { data: profile },
    { data: snapshots },
    { data: recentChats },
    { data: t212conn },
  ] = await Promise.all([
    admin.from('accounts')
      .select('id, name, institution_name, type, balance, interest_rate, include_in_net_worth')
      .eq('user_id', userId)
      .eq('include_in_net_worth', true)
      .order('balance', { ascending: false }),
    admin.from('goals')
      .select('target_retirement_age, target_monthly_income, target_lump_sum')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single(),
    admin.from('profiles')
      .select('date_of_birth, display_name, target_retirement_age')
      .eq('id', userId)
      .single(),
    admin.from('balance_snapshots')
      .select('account_id, balance, snapshotted_at')
      .in('account_id',
        (await admin.from('accounts').select('id').eq('user_id', userId).eq('include_in_net_worth', true))
          .data?.map(a => a.id) ?? []
      )
      .gte('snapshotted_at', sixMonthsAgo.toISOString())
      .order('snapshotted_at', { ascending: true }),
    admin.from('chat_messages')
      .select('role, content, created_at')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: true })
      .limit(50),
    admin.from('connections')
      .select('api_key, institution_id')
      .eq('user_id', userId)
      .eq('provider', 'trading212')
      .single(),
  ])

  if (!accounts?.length) throw new Error('No accounts found for user')

  // ── Net worth & breakdown by type ──────────────────────────────────────────
  const netWorth = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const byType: Record<string, number> = {}
  for (const a of accounts) byType[a.type] = (byType[a.type] ?? 0) + (a.balance ?? 0)

  // ── Infer monthly savings from snapshots ───────────────────────────────────
  // De-duplicate: per account per day take the latest reading, then sum across accounts.
  // Without de-dup, multiple manual snapshots on the same day inflate the total.
  const latestBalancePerAccountPerDay: Record<string, Record<string, number>> = {}
  for (const snap of (snapshots ?? []).sort((a, b) => a.snapshotted_at.localeCompare(b.snapshotted_at))) {
    const day = snap.snapshotted_at.slice(0, 10)
    if (!latestBalancePerAccountPerDay[day]) latestBalancePerAccountPerDay[day] = {}
    latestBalancePerAccountPerDay[day][snap.account_id] = Number(snap.balance)
  }
  const snapByDate: Record<string, number> = {}
  for (const [day, accountBalances] of Object.entries(latestBalancePerAccountPerDay)) {
    snapByDate[day] = Object.values(accountBalances).reduce((s, v) => s + v, 0)
  }
  const snapDates = Object.keys(snapByDate).sort()

  let impliedMonthlySavings: number | null = null
  let monthOverMonthChange: number | null = null

  if (snapDates.length >= 2) {
    const oldest = snapDates[0]
    const newest = snapDates[snapDates.length - 1]
    const [oy, om] = oldest.split('-').map(Number)
    const [ny, nm] = newest.split('-').map(Number)
    const months = (ny - oy) * 12 + (nm - om)
    if (months > 0) {
      impliedMonthlySavings = (snapByDate[newest] - snapByDate[oldest]) / months
    }
    // Month-over-month: compare the two most recent distinct snapshot dates
    // (snapshot-to-snapshot is more reliable than comparing to current account balances)
    const secondNewest = snapDates[snapDates.length - 2]
    monthOverMonthChange = snapByDate[newest] - snapByDate[secondNewest]
  }

  // ── Retirement calculations ────────────────────────────────────────────────
  const retireAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? null
  const targetLumpSum = goal?.target_lump_sum ?? null
  const targetMonthlyIncome = goal?.target_monthly_income ?? null
  const progressPct = targetLumpSum ? Math.min(100, Math.round((netWorth / targetLumpSum) * 100)) : null
  const gapToTarget = targetLumpSum ? Math.max(0, targetLumpSum - netWorth) : null

  // Years to retirement
  let yearsLeft: number | null = null
  if (profile?.date_of_birth && retireAge) {
    const dob = new Date(profile.date_of_birth)
    const ageNow = now.getFullYear() - dob.getFullYear() -
      (now < new Date(now.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    yearsLeft = Math.max(0, retireAge - ageNow)
  }

  const monthsLeft = yearsLeft !== null ? yearsLeft * 12 : null
  const requiredMonthlySaving = (gapToTarget !== null && monthsLeft && monthsLeft > 0)
    ? gapToTarget / monthsLeft
    : null

  const savingsGap = (requiredMonthlySaving !== null && impliedMonthlySavings !== null)
    ? requiredMonthlySaving - impliedMonthlySavings
    : null

  // ── T212 portfolio ─────────────────────────────────────────────────────────
  let portfolioSection = ''
  if (t212conn?.api_key) {
    const [t212Cash, positions] = await Promise.all([
      fetchT212Cash(t212conn.api_key, t212conn.institution_id ?? 'live'),
      fetchT212Portfolio(t212conn.api_key, t212conn.institution_id ?? 'live'),
    ])
    if (positions.length > 0) {
      const top = positions
        .sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl))
        .slice(0, 8)
        .map(p => {
          const returnPct = p.averagePrice > 0
            ? ((p.currentPrice - p.averagePrice) / p.averagePrice * 100).toFixed(1)
            : '0'
          return `${t212ToYahoo(p.ticker)}: qty ${p.quantity.toFixed(2)}, avg £${p.averagePrice.toFixed(2)}, now £${p.currentPrice.toFixed(2)} (${returnPct}% return), P&L £${p.ppl.toFixed(2)}`
        }).join('\n')
      portfolioSection = `
Trading 212 Portfolio:
- Total: £${t212Cash?.total?.toFixed(2) ?? 'N/A'} | Invested: £${t212Cash?.invested?.toFixed(2) ?? 'N/A'} | P&L: £${t212Cash?.ppl?.toFixed(2) ?? 'N/A'} | Free cash: £${t212Cash?.free?.toFixed(2) ?? 'N/A'}
Top positions:
${top}`
    }
  }

  const accountsSummary = accounts.map(a =>
    `${a.institution_name ?? ''} ${a.name} (${a.type}): £${(a.balance ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}${a.interest_rate ? ` @ ${a.interest_rate}%` : ''}`
  ).join('\n')

  const goalSummary = goal
    ? `Retire at ${retireAge ?? 'not set'}, monthly income target £${targetMonthlyIncome ?? 'not set'}/mo, lump sum target ${targetLumpSum ? fmtGBP(targetLumpSum) : 'not set'}`
    : 'No retirement goal set'

  // ── Build AI prompt ────────────────────────────────────────────────────────
  const chatContext = recentChats?.length
    ? recentChats.map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content.slice(0, 500)}`).join('\n')
    : null

  const savingsRateText = impliedMonthlySavings !== null
    ? `Implied monthly savings rate (from snapshots): ${impliedMonthlySavings >= 0 ? '+' : ''}${fmtGBP(impliedMonthlySavings)}/month`
    : 'No snapshot history available to compute savings rate'

  const gapText = savingsGap !== null
    ? savingsGap > 0
      ? `SAVINGS GAP: needs £${Math.round(savingsGap).toLocaleString('en-GB')} more per month to reach target`
      : `ON TRACK: saving £${Math.round(Math.abs(savingsGap)).toLocaleString('en-GB')}/month MORE than needed`
    : ''

  const prompt = `You are a UK personal finance education tool. Analyse the following monthly financial review and provide 4 specific, actionable recommendations focused on helping this person retire at their target age.

${chatContext ? `RECENT ADVISOR CONVERSATIONS (last 7 days):
${chatContext}

CRITICAL INSTRUCTION: Your recommendations MUST directly follow up on the topics above. Give concrete next steps based on what was discussed. Do not give generic advice.

` : ''}MONTHLY FINANCIAL REVIEW:
Net worth: ${fmtGBP(netWorth)}
${monthOverMonthChange !== null ? `Change vs ~30 days ago: ${monthOverMonthChange >= 0 ? '+' : ''}${fmtGBP(monthOverMonthChange)}` : ''}
${savingsRateText}
${gapText}

Accounts:
${accountsSummary}
${portfolioSection ? `\n${portfolioSection}` : ''}

Retirement goal: ${goalSummary}
${yearsLeft !== null ? `Years to retirement: ${yearsLeft}` : ''}
${progressPct !== null ? `Progress toward lump sum: ${progressPct}%` : ''}
${requiredMonthlySaving !== null ? `Required monthly saving to hit target: ${fmtGBP(requiredMonthlySaving)}/month` : ''}

Provide exactly 4 recommendations in JSON focused on retirement planning:
{
  "summary": "2-sentence assessment of where they stand vs their retirement goal this month",
  "recommendations": [
    {
      "title": "short action title",
      "detail": "2-3 sentence explanation with their actual numbers — what to do THIS month, why, and the specific impact on their retirement",
      "priority": "high|medium|low"
    }
  ]
}

Rules:
- Reference actual account names, balances, and the savings gap/surplus
- ${chatContext ? 'First 1-2 recommendations MUST address topics from the recent advisor conversations' : 'Be specific — reference accounts by name and real numbers'}
- Focus on actionable steps: move money, invest more, change allocation — not generic "save more"
- If there is a savings gap, be concrete about how to close it
- This is for a UK investor — reference ISA allowances, pension contributions, GIA tax implications
- Note: educational only, not regulated financial advice`

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON')

  const parsed = JSON.parse(jsonMatch[0])
  const { summary, recommendations } = parsed
  if (!summary || !Array.isArray(recommendations)) throw new Error('AI response missing summary or recommendations')

  // ── Build email HTML ───────────────────────────────────────────────────────
  const priorityColour: Record<string, string> = {
    high: '#dc2626', medium: '#d97706', low: '#16a34a',
  }

  const recHtml = (recommendations as { title: string; detail: string; priority: string }[])
    .map(r => `
      <div style="border-left: 3px solid ${priorityColour[r.priority] ?? '#94a3b8'}; padding: 12px 16px; margin-bottom: 12px; background: #f8fafc; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">${r.title}</p>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.6;">${r.detail}</p>
      </div>`)
    .join('')

  // Type breakdown rows
  const typeBreakdownHtml = Object.entries(byType)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([type, bal]) => {
      const color = TYPE_COLORS[type] ?? '#6b7280'
      const label = TYPE_LABELS[type] ?? type
      const barWidth = netWorth !== 0 ? Math.min(100, Math.round(Math.abs(bal / netWorth) * 100)) : 0
      const isNeg = bal < 0
      return `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 10px;">
        <tr>
          <td style="font-size: 12px; color: #475569; padding-bottom: 3px;">${label}</td>
          <td style="font-size: 12px; font-weight: 600; text-align: right; color: ${isNeg ? '#dc2626' : '#0f172a'}; padding-bottom: 3px;">${fmtGBP(bal)}</td>
        </tr>
        <tr>
          <td colspan="2">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="${barWidth}%" style="height: 4px; background: ${isNeg ? '#dc2626' : color}; border-radius: 2px; line-height: 4px; font-size: 0;">&nbsp;</td>
                <td width="${100 - barWidth}%" style="height: 4px; background: #e2e8f0; line-height: 4px; font-size: 0;">&nbsp;</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`
    }).join('')

  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  // Month-over-month indicator
  const momHtml = monthOverMonthChange !== null ? `
    <p style="margin: 6px 0 0; font-size: 13px; color: ${monthOverMonthChange >= 0 ? '#16a34a' : '#dc2626'}; font-weight: 600;">
      ${monthOverMonthChange >= 0 ? '▲' : '▼'} ${monthOverMonthChange >= 0 ? '+' : ''}${fmtGBP(monthOverMonthChange)} vs last month
    </p>` : ''

  // Savings rate + gap section
  const savingsHtml = (impliedMonthlySavings !== null || requiredMonthlySaving !== null) ? `
    <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 16px;">
      <p style="margin: 0 0 12px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Monthly savings check</p>
      <table width="100%" cellpadding="0" cellspacing="0">
        ${impliedMonthlySavings !== null ? `
        <tr>
          <td style="font-size: 13px; color: #475569; padding-bottom: 8px;">Your average savings rate</td>
          <td style="font-size: 14px; font-weight: 700; text-align: right; color: ${impliedMonthlySavings >= 0 ? '#16a34a' : '#dc2626'}; padding-bottom: 8px;">${impliedMonthlySavings >= 0 ? '+' : ''}${fmtGBPExact(impliedMonthlySavings)}/mo</td>
        </tr>` : ''}
        ${requiredMonthlySaving !== null ? `
        <tr>
          <td style="font-size: 13px; color: #475569; padding-bottom: 8px;">Needed to retire at ${retireAge}</td>
          <td style="font-size: 14px; font-weight: 700; text-align: right; color: #4f46e5; padding-bottom: 8px;">${fmtGBPExact(requiredMonthlySaving)}/mo</td>
        </tr>` : ''}
        ${savingsGap !== null ? `
        <tr>
          <td colspan="2" style="padding-top: 4px; border-top: 1px solid #e2e8f0;">
            <p style="margin: 8px 0 0; font-size: 13px; font-weight: 600; color: ${savingsGap > 0 ? '#dc2626' : '#16a34a'};">
              ${savingsGap > 0
                ? `⚠ Gap: save ${fmtGBP(savingsGap)} more per month to stay on track`
                : `✓ On track — you're saving ${fmtGBP(Math.abs(savingsGap))}/mo above target`}
            </p>
          </td>
        </tr>` : ''}
      </table>
    </div>` : ''

  await resend.emails.send({
    from,
    to: email,
    subject: `Sundeas — Monthly review: ${monthName}`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
        <div style="margin-bottom: 20px;">
          <span style="font-size: 20px; font-weight: 700;">Sundeas</span>
        </div>

        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 4px;">Monthly review</h1>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 20px;">${monthName}</p>

        <!-- Net worth + Retire at row -->
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 16px;">
          <tr>
            <td style="background: #f1f5f9; border-radius: 10px; padding: 14px 18px; width: 48%;">
              <p style="margin: 0 0 4px; font-size: 11px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Net worth</p>
              <p style="margin: 0; font-size: 22px; font-weight: 700;">${fmtGBP(netWorth)}</p>
              ${momHtml}
            </td>
            <td style="width: 4%;"></td>
            ${retireAge ? `
            <td style="background: #eef2ff; border-radius: 10px; padding: 14px 18px; width: 48%;">
              <p style="margin: 0 0 4px; font-size: 11px; font-weight: 500; color: #6366f1; text-transform: uppercase; letter-spacing: 0.05em;">Retire at ${retireAge}</p>
              ${targetLumpSum ? `
              <p style="margin: 0; font-size: 22px; font-weight: 700; color: #4f46e5;">${progressPct}%</p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top: 6px;">
                <tr>
                  <td width="${progressPct}%" style="height: 4px; background: #4f46e5; border-radius: 2px; line-height: 4px; font-size: 0;">&nbsp;</td>
                  <td width="${100 - progressPct!}%" style="height: 4px; background: #c7d2fe; line-height: 4px; font-size: 0;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin: 4px 0 0; font-size: 11px; color: #6366f1;">${yearsLeft !== null ? `${yearsLeft} years left · ` : ''}${fmtGBP(gapToTarget ?? 0)} still needed</p>
              ` : `<p style="margin: 0; font-size: 14px; color: #6366f1;">No target set</p>`}
            </td>` : '<td style="width: 48%;"></td>'}
          </tr>
        </table>

        ${savingsHtml}

        <!-- Net worth breakdown by type -->
        <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px 18px; margin-bottom: 24px;">
          <p style="margin: 0 0 12px; font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Where your money is</p>
          ${typeBreakdownHtml}
        </div>

        <!-- AI Summary -->
        <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">${summary}</p>

        <h2 style="font-size: 15px; font-weight: 600; margin: 0 0 12px;">This month's actions</h2>
        ${recHtml}

        <a href="${appUrl}/advisor" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; margin-top: 8px;">
          Talk to your advisor →
        </a>

        <p style="color: #94a3b8; font-size: 11px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; line-height: 1.6;">
          This review is generated by AI and is for educational and informational purposes only.
          It does not constitute regulated financial advice. Always do your own research before making investment decisions.
        </p>
      </div>
    `,
  })
}
