import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { calcNetWorth } from '@/lib/finance'

const anthropic = new Anthropic()

export async function POST() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from('profiles').select('date_of_birth, target_retirement_age').eq('id', user.id).single(),
    supabase.from('accounts').select('id, balance, type, include_in_net_worth, is_manual').eq('user_id', user.id),
  ])

  const dob = profile?.date_of_birth
  const targetAge = profile?.target_retirement_age ?? 57
  const netWorth = calcNetWorth(accounts ?? [])

  const currentAge = dob
    ? Math.floor((Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 365.25))
    : null

  const yearsToRetirement = currentAge !== null ? targetAge - currentAge : null

  // Summarise account types for context
  const accountSummary = (accounts ?? []).reduce<Record<string, number>>((acc, a) => {
    if (!a.include_in_net_worth) return acc
    acc[a.type] = (acc[a.type] ?? 0) + (a.balance ?? 0)
    return acc
  }, {})

  const accountLines = Object.entries(accountSummary)
    .map(([type, total]) => `- ${type}: £${total.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`)
    .join('\n')

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `You are a UK personal finance planning tool. Calculate realistic retirement targets for this person.

Profile:
- Current age: ${currentAge ?? 'unknown'}
- Target retirement age: ${targetAge}
- Years to retirement: ${yearsToRetirement ?? 'unknown'}
- Current net worth: £${netWorth.toLocaleString('en-GB', { maximumFractionDigits: 0 })}
- Asset breakdown:
${accountLines || '- No accounts recorded'}

UK context to factor in:
- State pension starts at age 67: ~£11,502/year (£958/month) in 2024/25
- Retiring at ${targetAge} means ${targetAge < 67 ? `${67 - targetAge} years before state pension kicks in` : 'state pension available from retirement'}
- Use a 4% safe withdrawal rate as a guide for sustainable income from a pot
- Assume ~2.5% annual inflation
- This is educational guidance only, not regulated financial advice

Calculate and return JSON only, no markdown:
{
  "target_monthly_income": <number: recommended monthly income in retirement in today's £, round to nearest 100>,
  "target_lump_sum": <number: total pot needed to sustain that income, round to nearest 10000>,
  "reasoning": "<2-3 sentence plain English explanation of how you arrived at these figures>"
}`,
      },
    ],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('goals/suggest: could not parse response', raw)
    return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
  }

  try {
    const result = JSON.parse(jsonMatch[0])
    return NextResponse.json(result)
  } catch (e) {
    console.error('goals/suggest: JSON parse failed', e, raw)
    return NextResponse.json({ error: 'Invalid AI response' }, { status: 500 })
  }
}
