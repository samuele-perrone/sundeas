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

type MarketQuote = {
  symbol: string
  name: string
  price: number
  change: number
  changePct: number
  fiftyTwoWeekLow: number
  fiftyTwoWeekHigh: number
  analystRating?: string
}

const INDICES = ['^FTSE', '^GSPC', '^NDX', '^FTMC']
const INDEX_LABELS: Record<string, string> = {
  '^FTSE': 'FTSE 100',
  '^GSPC': 'S&P 500',
  '^NDX': 'Nasdaq 100',
  '^FTMC': 'FTSE 250',
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

async function fetchYahooQuotes(symbols: string[]): Promise<MarketQuote[]> {
  if (!symbols.length) return []
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&lang=en-US&region=GB`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' })
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    return (data?.quoteResponse?.result ?? []).map((q: Record<string, unknown>) => ({
      symbol: q.symbol as string,
      name: (q.longName ?? q.shortName ?? q.symbol) as string,
      price: q.regularMarketPrice as number,
      change: q.regularMarketChange as number,
      changePct: q.regularMarketChangePercent as number,
      fiftyTwoWeekLow: q.fiftyTwoWeekLow as number,
      fiftyTwoWeekHigh: q.fiftyTwoWeekHigh as number,
      analystRating: q.averageAnalystRating as string | undefined,
    }))
  } catch {
    return []
  }
}

function t212ToYahoo(ticker: string): string {
  return ticker.replace(/_(EQ|US|UK|DE|FR|NL|IT|ES|AU|CA)$/, '')
}

export async function sendDigestForUser(userId: string, email: string): Promise<void> {
  const admin = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://sundeas.com'
  const from = process.env.RESEND_FROM ?? 'Sundeas <digest@sundeas.com>'

  const { data: accounts } = await admin
    .from('accounts')
    .select('name, institution_name, type, balance, interest_rate, include_in_net_worth')
    .eq('user_id', userId)
    .eq('include_in_net_worth', true)
    .order('balance', { ascending: false })

  if (!accounts?.length) throw new Error('No accounts found for user')

  const { data: goal } = await admin
    .from('goals')
    .select('target_retirement_age, target_monthly_income, target_lump_sum')
    .eq('user_id', userId)
    .single()

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentChats } = await admin
    .from('chat_messages')
    .select('role, content, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: true })
    .limit(30)

  const { data: t212conn } = await admin
    .from('connections')
    .select('api_key, institution_id')
    .eq('user_id', userId)
    .eq('provider', 'trading212')
    .single()

  const holdingTickers = t212conn?.api_key
    ? (await fetchT212Portfolio(t212conn.api_key, t212conn.institution_id ?? 'live'))
        .sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl))
        .slice(0, 10)
        .map(p => t212ToYahoo(p.ticker))
    : []

  const [indiceQuotes, holdingQuotes] = await Promise.all([
    fetchYahooQuotes(INDICES),
    holdingTickers.length ? fetchYahooQuotes(holdingTickers) : Promise.resolve([]),
  ])

  const fmt = (n: number) => n >= 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`

  const indicesSection = indiceQuotes.length
    ? 'Market indices today:\n' + indiceQuotes.map(q =>
        `  ${INDEX_LABELS[q.symbol] ?? q.symbol}: ${q.price.toLocaleString('en-GB', { maximumFractionDigits: 0 })} (${fmt(q.changePct)}) | 52w range ${q.fiftyTwoWeekLow.toLocaleString()}–${q.fiftyTwoWeekHigh.toLocaleString()}`
      ).join('\n')
    : ''

  const holdingsMarketSection = holdingQuotes.length
    ? 'Current market data for portfolio holdings:\n' + holdingQuotes.map(q =>
        `  ${q.name} (${q.symbol}): £${q.price.toFixed(2)} (${fmt(q.changePct)})${q.analystRating ? ` | Analyst: ${q.analystRating}` : ''} | 52w ${q.fiftyTwoWeekLow.toFixed(2)}–${q.fiftyTwoWeekHigh.toFixed(2)}`
      ).join('\n')
    : ''

  let portfolioSection = ''

  if (t212conn?.api_key) {
    const [t212Cash, positions] = await Promise.all([
      fetchT212Cash(t212conn.api_key, t212conn.institution_id ?? 'live'),
      fetchT212Portfolio(t212conn.api_key, t212conn.institution_id ?? 'live'),
    ])

    if (positions.length > 0) {
      const topPositions = positions
        .sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl))
        .slice(0, 10)
        .map(p => {
          const returnPct = p.averagePrice > 0
            ? ((p.currentPrice - p.averagePrice) / p.averagePrice * 100).toFixed(1)
            : '0'
          return `${p.ticker}: qty ${p.quantity.toFixed(4)}, avg buy £${p.averagePrice.toFixed(2)}, now £${p.currentPrice.toFixed(2)} (${returnPct}%), P&L £${p.ppl.toFixed(2)}`
        })
        .join('\n')

      portfolioSection = `
Trading 212 Portfolio (${t212conn.institution_id ?? 'live'}):
- Total value: £${t212Cash?.total?.toFixed(2) ?? 'N/A'}
- Invested: £${t212Cash?.invested?.toFixed(2) ?? 'N/A'}
- Unrealised P&L: £${t212Cash?.ppl?.toFixed(2) ?? 'N/A'}
- Free cash: £${t212Cash?.free?.toFixed(2) ?? 'N/A'}

Top positions by P&L impact:
${topPositions}`
    }
  }

  const netWorth = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const accountsSummary = accounts.map(a =>
    `${a.institution_name ?? ''} ${a.name} (${a.type}): £${(a.balance ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${a.interest_rate ? ` @ ${a.interest_rate}%` : ''}`
  ).join('\n')

  const goalSummary = goal
    ? `Retirement age: ${goal.target_retirement_age ?? 'not set'}, Monthly income target: £${goal.target_monthly_income ?? 'not set'}, Lump sum target: £${goal.target_lump_sum ?? 'not set'}`
    : 'No retirement goal set'

  const chatContext = recentChats?.length
    ? recentChats.map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content.slice(0, 300)}`).join('\n')
    : null

  const prompt = `You are a UK personal finance education tool. Analyse the following financial snapshot for a user and provide clear, actionable investment recommendations. Be specific and reference actual figures from their data.

FINANCIAL SNAPSHOT:
Net worth (included accounts): £${netWorth.toLocaleString('en-GB', { minimumFractionDigits: 2 })}

Accounts:
${accountsSummary}
${portfolioSection ? `\n${portfolioSection}` : '\nNo investment portfolio connected.'}
${indicesSection ? `\n${indicesSection}` : ''}
${holdingsMarketSection ? `\n${holdingsMarketSection}` : ''}

Retirement goal: ${goalSummary}
${chatContext ? `\nRECENT ADVISOR CONVERSATIONS (last 7 days — use these to tailor recommendations to topics the user has been exploring):\n${chatContext}\n` : ''}
Provide exactly 4 recommendations in JSON:
{
  "summary": "2-sentence overall assessment",
  "recommendations": [
    {
      "title": "short action title",
      "detail": "2-3 sentence explanation referencing their actual numbers",
      "priority": "high|medium|low"
    }
  ]
}

Rules:
- Reference actual account names, balances, and percentages from the data
- If recent advisor conversations exist, prioritise topics the user has been asking about and build on that context
- Use today's market data (indices, % moves, 52-week ranges, analyst ratings) to make recommendations timely and market-aware
- If T212 is connected, reference specific holdings vs their 52-week range and analyst ratings where available
- Comment on portfolio concentration, top winners/losers, and cash vs invested ratio
- If no T212, recommend considering investment accounts if appropriate
- Compare ISA/pension contributions to general savings
- Be educational and specific — no generic advice
- Always include the disclaimer that this is informational only, not regulated financial advice`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('AI response did not contain valid JSON')

  const parsed = JSON.parse(jsonMatch[0])
  const { summary, recommendations } = parsed
  if (!summary || !Array.isArray(recommendations)) throw new Error('AI response missing summary or recommendations')

  const priorityColour: Record<string, string> = {
    high: '#dc2626',
    medium: '#d97706',
    low: '#16a34a',
  }

  const recHtml = (recommendations as { title: string; detail: string; priority: string }[])
    .map(r => `
      <div style="border-left: 3px solid ${priorityColour[r.priority] ?? '#94a3b8'}; padding: 12px 16px; margin-bottom: 12px; background: #f8fafc; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 4px; font-size: 14px; font-weight: 600;">${r.title}</p>
        <p style="margin: 0; font-size: 13px; color: #475569; line-height: 1.6;">${r.detail}</p>
      </div>`)
    .join('')

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  await resend.emails.send({
    from,
    to: email,
    subject: `Sundeas — Your daily investment digest (${today})`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #0f172a;">
        <div style="margin-bottom: 24px;">
          <span style="font-size: 20px; font-weight: 700;">Sundeas</span>
        </div>

        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 4px;">Daily investment digest</h1>
        <p style="color: #94a3b8; font-size: 13px; margin: 0 0 20px;">${today}</p>

        <div style="background: #f1f5f9; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
          <p style="margin: 0 0 4px; font-size: 12px; font-weight: 500; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">Net worth</p>
          <p style="margin: 0; font-size: 24px; font-weight: 700;">£${netWorth.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</p>
        </div>

        <p style="color: #334155; font-size: 14px; line-height: 1.7; margin: 0 0 20px;">${summary}</p>

        <h2 style="font-size: 15px; font-weight: 600; margin: 0 0 12px;">Today's recommendations</h2>
        ${recHtml}

        <a href="${appUrl}/dashboard" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; margin-top: 8px;">
          View dashboard →
        </a>

        <p style="color: #94a3b8; font-size: 11px; margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 16px; line-height: 1.6;">
          This digest is generated by AI and is for educational and informational purposes only.
          It does not constitute regulated financial advice. Always do your own research before making investment decisions.
          You're receiving this because you have a Sundeas account.
        </p>
      </div>
    `,
  })
}
