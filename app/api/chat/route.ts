import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import {
  calcNetWorth, calcYearsToRetirement, calcRetirementProgress,
  calcRequiredMonthlySaving, toMonthlyAmount, formatGBP,
} from '@/lib/finance'

const anthropic = new Anthropic()

const TYPE_LABELS: Record<string, string> = {
  current: 'Current account', savings: 'Savings', isa: 'ISA',
  pension: 'Pension / SIPP', investment: 'Investment', mortgage: 'Mortgage',
  credit_card: 'Credit card', other: 'Other',
}

const CAT_LABEL: Record<string, string> = {
  salary: 'Salary', dividends: 'Dividends', rental: 'Rental income', pension: 'Pension income',
  freelance: 'Freelance', benefits: 'Benefits', rent: 'Rent', mortgage: 'Mortgage payment',
  bills: 'Bills', subscriptions: 'Subscriptions', insurance: 'Insurance',
  direct_debit: 'Direct debit', transport: 'Transport', childcare: 'Childcare', other: 'Other',
}

async function buildSystemPrompt(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string> {
  const [
    { data: accounts },
    { data: profile },
    { data: goal },
    { data: recurring },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('user_id', userId),
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).single(),
    supabase.from('recurring_payments').select('*').eq('user_id', userId),
  ])

  const all = accounts ?? []
  const netWorth = calcNetWorth(all)
  const targetAge = goal?.target_retirement_age ?? profile?.target_retirement_age ?? 57
  const yearsLeft = calcYearsToRetirement(profile?.date_of_birth ?? null, targetAge)
  const targetLumpSum: number | null = goal?.target_lump_sum ?? null
  const progress = targetLumpSum ? calcRetirementProgress(netWorth, targetLumpSum) : null
  const monthlyRequired = targetLumpSum && yearsLeft !== null
    ? calcRequiredMonthlySaving(netWorth, targetLumpSum, yearsLeft) : null

  // Accounts by type
  const byType: Record<string, typeof all> = {}
  for (const acc of all) {
    if (!byType[acc.type]) byType[acc.type] = []
    byType[acc.type].push(acc)
  }
  const accountLines = Object.entries(byType).map(([type, accs]) => {
    const label = TYPE_LABELS[type] ?? type
    const lines = accs.map(a => {
      const parts = [`${a.institution_name ? `${a.institution_name} — ` : ''}${a.name}: ${formatGBP(a.balance ?? 0)}`]
      if (a.interest_rate) parts.push(`${a.interest_rate}% AER`)
      if (!a.include_in_net_worth) parts.push('(excluded from net worth)')
      const line = `    - ${parts.join(' · ')}`
      return a.notes ? `${line}\n      Notes: ${a.notes}` : line
    })
    return `  ${label}:\n${lines.join('\n')}`
  }).join('\n')

  // Recurring payments
  const allRecurring = recurring ?? []
  const incomeItems = allRecurring.filter(r => r.type === 'income')
  const expenseItems = allRecurring.filter(r => r.type === 'expense')
  const transferItems = allRecurring.filter(r => r.type === 'transfer')
  const monthlyIncome = incomeItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyExpenses = expenseItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0)
  const monthlyNet = monthlyIncome - monthlyExpenses

  const incomeLines = incomeItems.map(r => {
    const monthly = toMonthlyAmount(r.amount, r.frequency)
    const cat = r.category ? `${CAT_LABEL[r.category] ?? r.category}: ` : ''
    return `    - ${cat}${r.name}: ${formatGBP(monthly)}/month${r.frequency !== 'monthly' ? ` (${formatGBP(r.amount)} ${r.frequency})` : ''}`
  }).join('\n') || '    (none set)'

  const expenseLines = expenseItems.map(r => {
    const monthly = toMonthlyAmount(r.amount, r.frequency)
    const cat = r.category ? `${CAT_LABEL[r.category] ?? r.category}: ` : ''
    return `    - ${cat}${r.name}: ${formatGBP(monthly)}/month${r.frequency !== 'monthly' ? ` (${formatGBP(r.amount)} ${r.frequency})` : ''}`
  }).join('\n') || '    (none set)'

  const transferLines = transferItems.map(r => {
    const monthly = toMonthlyAmount(r.amount, r.frequency)
    const fromAcc = all.find(a => a.id === r.account_id)
    const toAcc = all.find(a => a.id === r.to_account_id)
    const from = fromAcc ? (fromAcc.institution_name ? `${fromAcc.institution_name} ${fromAcc.name}` : fromAcc.name) : 'unknown'
    const to = toAcc ? (toAcc.institution_name ? `${toAcc.institution_name} ${toAcc.name}` : toAcc.name) : 'unknown'
    return `    - ${r.name}: ${formatGBP(monthly)}/month from ${from} → ${to}`
  }).join('\n') || '    (none set)'

  const today = new Date()
  const dobStr = profile?.date_of_birth
  let ageStr = ''
  if (dobStr) {
    const dob = new Date(dobStr)
    const age = today.getFullYear() - dob.getFullYear() -
      (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0)
    ageStr = `Age: ${age}`
  }

  return `You are a knowledgeable personal finance assistant. You have access to the user's real financial data below. Use it to give specific, actionable, and personalised advice tailored to their actual situation and numbers.

USER PROFILE:
${profile?.display_name ? `Name: ${profile.display_name}` : ''}
${ageStr}
${dobStr ? `Date of birth: ${dobStr}` : ''}
Target retirement age: ${targetAge}${yearsLeft !== null ? ` (${yearsLeft} years away)` : ''}

NET WORTH: ${formatGBP(netWorth)}

ACCOUNTS:
${accountLines || '  (no accounts added yet)'}

RETIREMENT GOAL:
${targetLumpSum ? `  Target lump sum: ${formatGBP(targetLumpSum)}` : '  No target set yet'}
${goal?.target_monthly_income ? `  Target monthly income in retirement: ${formatGBP(goal.target_monthly_income)}` : ''}
${progress !== null ? `  Progress: ${Math.round(progress)}% (${formatGBP(netWorth)} of ${formatGBP(targetLumpSum!)})` : '  Progress: not set'}
${monthlyRequired !== null && monthlyRequired > 0 ? `  Required monthly saving to reach target: ${formatGBP(monthlyRequired)}` : ''}

MONTHLY BUDGET:
  Income: ${formatGBP(monthlyIncome)}/month
${incomeLines}

  Expenses: ${formatGBP(monthlyExpenses)}/month
${expenseLines}

  Transfers between accounts: ${formatGBP(transferItems.reduce((s, r) => s + toMonthlyAmount(r.amount, r.frequency), 0))}/month
${transferLines}

  Net monthly surplus: ${monthlyNet >= 0 ? '+' : ''}${formatGBP(monthlyNet)}/month

UK FINANCIAL CONTEXT:
- ISA annual allowance: £20,000/year (Stocks & Shares ISA or Cash ISA)
- Pension (SIPP/workplace) annual allowance: up to £60,000/year (or 100% of earnings, whichever is lower)
- State pension age: currently 67 (minimum pension access age rising to 57 in 2028)
- Current full state pension: ~£11,502/year
- Capital gains tax annual exemption: £3,000
- Personal savings allowance: £500 (higher rate taxpayer) or £1,000 (basic rate)
- 4% safe withdrawal rate is commonly used for retirement planning

IMPORTANT GUIDELINES:
- You are NOT a regulated financial advisor — always clarify this when making specific recommendations
- Frame all advice as educational and informational only
- Reference the user's actual account names, balances, and figures when relevant
- Be direct and specific — avoid vague generic advice
- When a decision is significant (e.g., changing pension contributions, investing large sums), recommend consulting a regulated IFA
- Keep responses concise and structured — use bullet points and clear sections
- Focus on UK-specific regulations, tax wrappers (ISA, SIPP), and financial context`
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json()

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response('ANTHROPIC_API_KEY not configured', { status: 500 })
  }

  const systemPrompt = await buildSystemPrompt(supabase, user.id)

  const stream = anthropic.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        stream.on('text', (text: string) => {
          controller.enqueue(encoder.encode(text))
        })
        await stream.finalMessage()
      } catch (e) {
        controller.error(e)
      } finally {
        controller.close()
      }
    },
    cancel() {
      stream.abort()
    },
  })

  return new Response(readable, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
