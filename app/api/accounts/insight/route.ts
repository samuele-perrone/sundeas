import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  // Verify the user is authenticated
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { institution_name, name, type, balance } = await req.json()

  const accountDesc = [
    institution_name && `Institution: ${institution_name}`,
    `Account name: ${name}`,
    `Account type: ${type}`,
    balance !== null && balance !== undefined && `Current balance: £${Number(balance).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  ].filter(Boolean).join('\n')

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `You are a UK personal finance education tool. A user has the following account:

${accountDesc}

Based on the institution name and account type, provide:
1. A realistic interest rate or expected annual return estimate for this type of account at this institution (use your knowledge of typical UK rates as of your training cutoff — acknowledge if you're estimating)
2. One concise, actionable recommendation (e.g. whether the rate is competitive, whether to consider switching, increasing contributions, etc.)

Respond in JSON with this exact shape:
{
  "rate_label": "e.g. ~4.5% AER, ~7% p.a. (historical avg), ~2.1% SVR",
  "rate_note": "one sentence context on the rate",
  "recommendation": "one sentence recommendation",
  "caveat": "short disclaimer e.g. 'Rate is an estimate based on training data — check the provider for the current rate.'"
}

Keep each field brief (under 20 words). Do not give personalised financial advice. Be factual and educational.`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''

  // Extract JSON from the response (Claude sometimes wraps in markdown)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  try {
    const insight = JSON.parse(jsonMatch[0])
    return NextResponse.json(insight)
  } catch (e) {
    console.error('Insight parse error:', e, 'Raw:', raw)
    return NextResponse.json({ error: 'Invalid AI response format' }, { status: 500 })
  }
}
