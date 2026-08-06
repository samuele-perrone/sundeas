import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export async function GET() {
  const wb = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { institution_name: 'Vanguard', name: 'Stocks & Shares ISA', type: 'isa', balance: 12500, interest_rate: 7, notes: 'Global all-cap fund', include_in_net_worth: 'true' },
    { institution_name: 'Monzo', name: 'Current Account', type: 'current', balance: 3200, interest_rate: '', notes: '', include_in_net_worth: 'true' },
    { institution_name: 'Nationwide', name: 'Flex Saver', type: 'savings', balance: 8000, interest_rate: 4.5, notes: '', include_in_net_worth: 'true' },
  ]), 'Accounts')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { account_name: 'Current Account', name: 'Salary', type: 'income', amount: 3500, frequency: 'monthly', category: 'salary', payment_date: '', to_account_name: '' },
    { account_name: 'Current Account', name: 'Rent', type: 'expense', amount: 1200, frequency: 'monthly', category: 'rent', payment_date: '', to_account_name: '' },
    { account_name: 'Current Account', name: 'Netflix', type: 'expense', amount: 17.99, frequency: 'monthly', category: 'subscriptions', payment_date: '', to_account_name: '' },
    { account_name: 'Current Account', name: 'Car insurance', type: 'expense', amount: 650, frequency: 'annual', category: 'insurance', payment_date: '', to_account_name: '' },
    { account_name: 'Current Account', name: 'Holiday', type: 'expense', amount: 2000, frequency: 'once', category: 'other', payment_date: '2025-06-01', to_account_name: '' },
  ]), 'Budget')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { target_retirement_age: 57, target_monthly_income: 3000, target_lump_sum: 750000, notes: 'Based on 4% SWR' },
  ]), 'Retirement Plan')

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { title: 'Open a Stocks & Shares ISA', description: 'Max out annual allowance of £20k', priority: 'high', due_date: '2025-04-05', completed: 'false', source: 'manual' },
    { title: 'Review mortgage deal', description: 'Fixed rate ends in 3 months', priority: 'medium', due_date: '', completed: 'false', source: 'manual' },
  ]), 'Todos')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="sundeas-import-template.xlsx"',
    },
  })
}
