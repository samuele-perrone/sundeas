export type Account = {
  id: string
  balance: number | null
  type: string
  include_in_net_worth: boolean
  is_manual: boolean
}

export type Transaction = {
  id: string
  amount: number
  description: string | null
  merchant_name: string | null
  category: string | null
  transaction_type: string | null
  is_recurring: boolean | null
  transacted_at: string
}

export function calcNetWorth(accounts: Account[]): number {
  return accounts
    .filter(a => a.include_in_net_worth)
    .reduce((sum, a) => sum + (a.balance ?? 0), 0)
}

export function calcRetirementProgress(netWorth: number, targetLumpSum: number): number {
  if (targetLumpSum <= 0) return 0
  return Math.min(100, (netWorth / targetLumpSum) * 100)
}

export function calcYearsToRetirement(dob: string | null, targetAge: number): number | null {
  if (!dob) return null
  const today = new Date()
  const birth = new Date(dob)
  const ageNow = today.getFullYear() - birth.getFullYear() -
    (today < new Date(today.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
  return Math.max(0, targetAge - ageNow)
}

export function calcRequiredMonthlySaving(
  netWorth: number,
  targetLumpSum: number,
  yearsToRetirement: number,
): number {
  if (yearsToRetirement <= 0) return 0
  const months = yearsToRetirement * 12
  return Math.max(0, (targetLumpSum - netWorth) / months)
}

export function toMonthlyAmount(amount: number, frequency: string): number {
  if (frequency === 'weekly') return (amount * 52) / 12
  if (frequency === 'annual') return amount / 12
  return amount // monthly
}

/** Group transactions into a category → total spend map (absolute values, debits only). */
export function sumByCategory(transactions: Transaction[]): Record<string, number> {
  const result: Record<string, number> = {}
  for (const t of transactions) {
    if (t.amount >= 0) continue // skip credits
    const key = t.category ?? t.transaction_type ?? 'other'
    result[key] = (result[key] ?? 0) + Math.abs(t.amount)
  }
  return result
}

export function formatGBP(amount: number): string {
  const abs = Math.abs(amount)
  const formatted = abs.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return amount < 0 ? `-£${formatted}` : `£${formatted}`
}
