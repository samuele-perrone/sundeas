import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

const VALID_TYPES = new Set(['current', 'savings', 'isa', 'pension', 'investment', 'mortgage', 'credit_card', 'other'])
const VALID_PRIORITIES = new Set(['high', 'medium', 'low'])
const VALID_FREQUENCIES = new Set(['weekly', 'monthly', 'annual', 'once'])

function str(v: unknown): string { return v == null ? '' : String(v).trim() }
function num(v: unknown): number | null {
  const n = parseFloat(String(v))
  return isNaN(n) ? null : n
}
function bool(v: unknown): boolean { return str(v).toLowerCase() !== 'false' }

function sheetToRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, unknown>[]
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(buf)

  const results = { accounts: 0, budget: 0, goals: 0, todos: 0, errors: [] as string[] }

  // 1. Import accounts — build name→id map for budget linkage
  const accountNameToId: Record<string, string> = {}

  // Load existing accounts into map first
  const { data: existingAccounts } = await supabase
    .from('accounts').select('id, name').eq('user_id', user.id)
  for (const a of existingAccounts ?? []) accountNameToId[a.name] = a.id

  const accountRows = sheetToRows(wb, 'Accounts')
  const accountInserts = []
  for (const r of accountRows) {
    const name = str(r.name)
    if (!name) continue
    const balance = num(r.balance)
    if (balance === null) continue
    accountInserts.push({
      user_id: user.id,
      institution_name: str(r.institution_name) || null,
      name,
      type: VALID_TYPES.has(str(r.type)) ? str(r.type) : 'other',
      balance,
      interest_rate: num(r.interest_rate),
      rate_source: num(r.interest_rate) !== null ? 'manual' : null,
      notes: str(r.notes) || null,
      include_in_net_worth: bool(r.include_in_net_worth),
      currency: 'GBP',
      is_manual: true,
    })
  }
  if (accountInserts.length) {
    const { data: inserted, error } = await supabase.from('accounts').insert(accountInserts).select('id, name')
    if (error) results.errors.push(`Accounts: ${error.message}`)
    else {
      results.accounts = inserted?.length ?? 0
      for (const a of inserted ?? []) accountNameToId[a.name] = a.id
    }
  }

  // 2. Import budget (recurring_payments)
  const budgetRows = sheetToRows(wb, 'Budget')
  const budgetInserts = []
  for (const r of budgetRows) {
    const name = str(r.name)
    const accountName = str(r.account_name)
    const accountId = accountNameToId[accountName]
    if (!name || !accountId) continue
    const amount = num(r.amount)
    if (amount === null) continue
    const freq = str(r.frequency)
    budgetInserts.push({
      user_id: user.id,
      account_id: accountId,
      name,
      type: ['income', 'expense', 'transfer'].includes(str(r.type)) ? str(r.type) : 'expense',
      amount,
      frequency: VALID_FREQUENCIES.has(freq) ? freq : 'monthly',
      category: str(r.category) || null,
      payment_date: str(r.payment_date) || null,
      to_account_id: accountNameToId[str(r.to_account_name)] ?? null,
    })
  }
  if (budgetInserts.length) {
    const { error } = await supabase.from('recurring_payments').insert(budgetInserts)
    if (error) results.errors.push(`Budget: ${error.message}`)
    else results.budget = budgetInserts.length
  }

  // 3. Import retirement goals
  const goalRows = sheetToRows(wb, 'Retirement Plan')
  const goalInserts = []
  for (const r of goalRows) {
    const age = num(r.target_retirement_age)
    if (age === null) continue
    goalInserts.push({
      user_id: user.id,
      target_retirement_age: Math.round(age),
      target_monthly_income: num(r.target_monthly_income),
      target_lump_sum: num(r.target_lump_sum),
      notes: str(r.notes) || null,
    })
  }
  if (goalInserts.length) {
    const { error } = await supabase.from('goals').insert(goalInserts)
    if (error) results.errors.push(`Goals: ${error.message}`)
    else results.goals = goalInserts.length
  }

  // 4. Import todos
  const todoRows = sheetToRows(wb, 'Todos')
  const todoInserts = []
  for (const r of todoRows) {
    const title = str(r.title)
    if (!title) continue
    todoInserts.push({
      user_id: user.id,
      title,
      description: str(r.description) || null,
      priority: VALID_PRIORITIES.has(str(r.priority)) ? str(r.priority) : 'medium',
      due_date: str(r.due_date) || null,
      completed_at: str(r.completed).toLowerCase() === 'true' ? new Date().toISOString() : null,
      source: 'manual',
    })
  }
  if (todoInserts.length) {
    const { error } = await supabase.from('todos').insert(todoInserts)
    if (error) results.errors.push(`Todos: ${error.message}`)
    else results.todos = todoInserts.length
  }

  return NextResponse.json(results)
}
