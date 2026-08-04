import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const anthropic = new Anthropic()

const URL_REGEX = /https?:\/\/[^\s"'<>]+/g

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&pound;/g, '£').replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000)
    return text || null
  } catch {
    return null
  }
}

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: accounts, error } = await supabase
    .from('accounts')
    .select('id, institution_name, name, type, balance, notes')
    .eq('user_id', user.id)
    .eq('is_manual', true)
    .neq('rate_source', 'manual')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!accounts || accounts.length === 0) {
    return NextResponse.json({ updated: 0 })
  }

  // Fetch page content for any account whose notes contain a URL
  const pageContents = await Promise.all(
    accounts.map(async (a) => {
      if (!a.notes) return null
      const urls = a.notes.match(URL_REGEX)
      if (!urls) return null
      const text = await fetchPageText(urls[0])
      return text
    })
  )

  // Build the account list, embedding fetched page content where available
  const accountList = accounts.map((a, i) => {
    const parts = [
      `id="${a.id}"`,
      `institution="${a.institution_name ?? 'unknown'}"`,
      `name="${a.name}"`,
      `type="${a.type}"`,
      `balance=£${Number(a.balance ?? 0).toFixed(2)}`,
    ]
    // Include notes only if no URL was found (plain text notes are still useful)
    const urls = a.notes?.match(URL_REGEX)
    if (a.notes && !urls) parts.push(`notes="${a.notes}"`)

    let entry = `${i + 1}. ${parts.join(' | ')}`

    if (pageContents[i]) {
      entry += `\n   [LIVE PAGE CONTENT — use this to extract the exact rate]: ${pageContents[i]}`
    }

    return entry
  }).join('\n\n')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `You are a UK personal finance data tool. For each account below, determine the interest rate or expected annual return.

Rules (in priority order):
1. If LIVE PAGE CONTENT is provided for an account, extract the exact interest rate from that page — this is the most accurate source
2. If the notes field explicitly states a rate (e.g. "fixed at 3.5%", "4.1% AER"), use that exact number
3. Otherwise, estimate based on institution name and account type using your training data
4. Return rate as a plain number representing percentage (e.g. 4.5 means 4.5%, 8 means 8%)
5. If genuinely unknowable, return null

Account type guidance for estimation:
- savings / ISA / current: typical AER
- mortgage / credit_card: typical APR or SVR
- pension / investment: realistic long-term annual return (e.g. 7 for global equity index)

Accounts:
${accountList}

Respond ONLY with a JSON array, no markdown, no explanation:
[{"id":"...","rate":4.5},{"id":"...","rate":null},...]`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    console.error('sync-rates: could not parse AI response', raw)
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  let results: Array<{ id: string; rate: number | null }>
  try {
    results = JSON.parse(jsonMatch[0])
  } catch (e) {
    console.error('sync-rates: JSON parse failed', e, raw)
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })
  }

  const updates = results.filter(r => r.rate !== null && r.id)
  await Promise.all(
    updates.map(({ id, rate }) =>
      supabase.from('accounts').update({
        interest_rate: rate,
        rate_source: 'ai',
        updated_at: new Date().toISOString(),
      }).eq('id', id).eq('user_id', user.id)
    )
  )

  return NextResponse.json({ updated: updates.length, total: accounts.length })
}
