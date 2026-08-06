import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    { data: accounts },
    { data: recurring },
    { data: goals },
    { data: todos },
  ] = await Promise.all([
    supabase.from('accounts')
      .select('institution_name, name, type, balance, interest_rate, notes, include_in_net_worth')
      .eq('user_id', user.id).eq('is_manual', true).order('created_at'),
    supabase.from('recurring_payments')
      .select('name, type, amount, frequency, category, payment_date, accounts!account_id(name), to_accounts:accounts!to_account_id(name)')
      .eq('user_id', user.id).order('created_at'),
    supabase.from('goals')
      .select('target_retirement_age, target_monthly_income, target_lump_sum, notes')
      .eq('user_id', user.id).order('created_at'),
    supabase.from('todos')
      .select('title, description, priority, due_date, completed_at, source')
      .eq('user_id', user.id).order('created_at'),
  ])

  const wb = XLSX.utils.book_new()

  // Accounts sheet
  const accountRows = (accounts ?? []).map(a => ({
    institution_name: a.institution_name ?? '',
    name: a.name,
    type: a.type,
    balance: a.balance ?? 0,
    interest_rate: a.interest_rate ?? '',
    notes: a.notes ?? '',
    include_in_net_worth: a.include_in_net_worth ? 'true' : 'false',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(accountRows), 'Accounts')

  // Budget sheet
  const budgetRows = (recurring ?? []).map((r: Record<string, unknown>) => {
    const acc = r.accounts as { name: string } | null
    const toAcc = r.to_accounts as { name: string } | null
    return {
      account_name: acc?.name ?? '',
      name: r.name,
      type: r.type,
      amount: r.amount,
      frequency: r.frequency,
      category: r.category ?? '',
      payment_date: r.payment_date ?? '',
      to_account_name: toAcc?.name ?? '',
    }
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(budgetRows.length ? budgetRows : [{}]), 'Budget')

  // Retirement plan sheet
  const goalRows = (goals ?? []).map(g => ({
    target_retirement_age: g.target_retirement_age,
    target_monthly_income: g.target_monthly_income ?? '',
    target_lump_sum: g.target_lump_sum ?? '',
    notes: g.notes ?? '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(goalRows.length ? goalRows : [{}]), 'Retirement Plan')

  // Todos sheet
  const todoRows = (todos ?? []).map(t => ({
    title: t.title,
    description: t.description ?? '',
    priority: t.priority,
    due_date: t.due_date ?? '',
    completed: t.completed_at ? 'true' : 'false',
    source: t.source ?? 'manual',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todoRows.length ? todoRows : [{}]), 'Todos')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="sundeas-backup-${date}.xlsx"`,
    },
  })
}
