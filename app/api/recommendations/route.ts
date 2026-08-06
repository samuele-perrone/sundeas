import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

const LIVE_BASE = 'https://live.trading212.com/api/v0'
const DEMO_BASE = 'https://demo.trading212.com/api/v0'

const INDICES = ['^FTSE', '^GSPC', '^NDX']
const INDEX_LABELS: Record<string, string> = {
  '^FTSE': 'FTSE 100', '^GSPC': 'S&P 500', '^NDX': 'Nasdaq 100',
}

async function fetchYahooQuotes(symbols: string[]) {
  if (!symbols.length) return []
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(',')}&lang=en-US&region=GB`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' },
    )
    if (!res.ok) return []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await res.json() as any
    return data?.quoteResponse?.result ?? []
  } catch { return [] }
}

function t212ToYahoo(ticker: string) {
  return ticker.replace(/_(EQ|US|UK|DE|FR|NL|IT|ES|AU|CA)$/, '')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const [
    { data: accounts },
    { data: goal },
    { data: t212conn },
  ] = await Promise.all([
    admin.from('accounts').select('name, institution_name, type, balance, interest_rate, include_in_net_worth').eq('user_id', user.id).eq('include_in_net_worth', true).order('balance', { ascending: false }),
    admin.from('goals').select('target_retirement_age, target_monthly_income, target_lump_sum').eq('user_id', user.id).single(),
    admin.from('connections').select('api_key, institution_id').eq('user_id', user.id).eq('provider', 'trading212').single(),
  ])

  if (!accounts?.length) return NextResponse.json({ recommendations: [], summary: '' })

  // Recent chat context
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentChats } = await admin
    .from('chat_messages').select('role, content').eq('user_id', user.id)
    .gte('created_at', sevenDaysAgo).order('created_at', { ascending: true }).limit(20)

  // T212 positions
  let portfolioSection = ''
  if (t212conn?.api_key) {
    try {
      const base = t212conn.institution_id === 'demo' ? DEMO_BASE : LIVE_BASE
      const [cashRes, posRes] = await Promise.all([
        fetch(`${base}/equity/account/cash`, { headers: { Authorization: t212conn.api_key }, cache: 'no-store' }),
        fetch(`${base}/equity/portfolio`, { headers: { Authorization: t212conn.api_key }, cache: 'no-store' }),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cash = cashRes.ok ? await cashRes.json() as any : null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const positions: any[] = posRes.ok ? await posRes.json() : []

      if (positions.length > 0) {
        const top = positions.sort((a, b) => Math.abs(b.ppl) - Math.abs(a.ppl)).slice(0, 8)
        portfolioSection = `Trading 212 (${t212conn.institution_id ?? 'live'}):
- Total: £${cash?.total?.toFixed(2) ?? 'N/A'} | Invested: £${cash?.invested?.toFixed(2) ?? 'N/A'} | P&L: £${cash?.ppl?.toFixed(2) ?? 'N/A'} | Free cash: £${cash?.free?.toFixed(2) ?? 'N/A'}
Top positions:
${top.map(p => {
  const ret = p.averagePrice > 0 ? ((p.currentPrice - p.averagePrice) / p.averagePrice * 100).toFixed(1) : '0'
  return `  ${p.ticker}: qty ${p.quantity.toFixed(2)}, avg £${p.averagePrice.toFixed(2)}, now £${p.currentPrice.toFixed(2)} (${ret}%), P&L £${p.ppl.toFixed(2)}`
}).join('\n')}`

        // Fetch Yahoo quotes for top holdings
        const yahooTickers = top.slice(0, 6).map(p => t212ToYahoo(p.ticker))
        const quotes = await fetchYahooQuotes(yahooTickers)
        if (quotes.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          portfolioSection += '\nLive market data for holdings:\n' + quotes.map((q: any) =>
            `  ${q.longName ?? q.symbol}: £${q.regularMarketPrice?.toFixed(2)} (${q.regularMarketChangePercent >= 0 ? '+' : ''}${q.regularMarketChangePercent?.toFixed(2)}%)${q.averageAnalystRating ? ` | Analyst: ${q.averageAnalystRating}` : ''} | 52w ${q.fiftyTwoWeekLow?.toFixed(2)}–${q.fiftyTwoWeekHigh?.toFixed(2)}`
          ).join('\n')
        }
      }
    } catch { /* skip T212 on error */ }
  }

  // Market indices
  const indexQuotes = await fetchYahooQuotes(INDICES)
  const fmt = (n: number) => n >= 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indicesSection = indexQuotes.length ? indexQuotes.map((q: any) =>
    `${INDEX_LABELS[q.symbol] ?? q.symbol}: ${q.regularMarketPrice?.toLocaleString()} (${fmt(q.regularMarketChangePercent)}) | 52w ${q.fiftyTwoWeekLow?.toLocaleString()}–${q.fiftyTwoWeekHigh?.toLocaleString()}`
  ).join('\n') : ''

  const netWorth = accounts.reduce((s, a) => s + (a.balance ?? 0), 0)
  const accountsSummary = accounts.map(a =>
    `${a.institution_name ?? ''} ${a.name} (${a.type}): £${(a.balance ?? 0).toFixed(2)}${a.interest_rate ? ` @ ${a.interest_rate}%` : ''}`
  ).join('\n')

  const chatContext = recentChats?.length
    ? recentChats.map(m => `${m.role === 'user' ? 'User' : 'Advisor'}: ${m.content.slice(0, 200)}`).join('\n')
    : null

  const prompt = `You are a UK personal finance education tool. Generate 4 investment recommendations for this user.

Net worth: £${netWorth.toFixed(2)}
Accounts:\n${accountsSummary}
${portfolioSection ? `\n${portfolioSection}` : ''}
${indicesSection ? `\nMarket today:\n${indicesSection}` : ''}
${goal ? `\nRetirement: age ${goal.target_retirement_age ?? 'not set'}, target £${goal.target_lump_sum ?? 'not set'}` : ''}
${chatContext ? `\nRecent advisor chats (tailor to these topics):\n${chatContext}` : ''}

Respond in JSON only:
{
  "summary": "2-sentence overall assessment referencing actual figures",
  "recommendations": [
    { "title": "short action title", "detail": "2-3 sentences with specific figures", "priority": "high|medium|low" }
  ]
}

Rules: reference actual numbers, use today's market data, build on recent chat topics, be educational not advice.`

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ recommendations: [], summary: '' })

  try {
    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ recommendations: [], summary: '' })
  }
}
