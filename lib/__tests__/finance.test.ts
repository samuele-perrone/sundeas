import { describe, it, expect } from 'vitest'
import {
  calcNetWorth,
  calcRetirementProgress,
  calcYearsToRetirement,
  calcRequiredMonthlySaving,
  sumByCategory,
  formatGBP,
} from '../finance'

describe('calcNetWorth', () => {
  it('sums balances for accounts included in net worth', () => {
    const accounts = [
      { id: '1', balance: 1000, type: 'current', include_in_net_worth: true, is_manual: false },
      { id: '2', balance: 5000, type: 'savings', include_in_net_worth: true, is_manual: false },
    ]
    expect(calcNetWorth(accounts)).toBe(6000)
  })

  it('excludes accounts opted out of net worth', () => {
    const accounts = [
      { id: '1', balance: 1000, type: 'current', include_in_net_worth: true, is_manual: false },
      { id: '2', balance: 9000, type: 'mortgage', include_in_net_worth: false, is_manual: false },
    ]
    expect(calcNetWorth(accounts)).toBe(1000)
  })

  it('handles null balances as zero', () => {
    const accounts = [
      { id: '1', balance: null, type: 'current', include_in_net_worth: true, is_manual: false },
    ]
    expect(calcNetWorth(accounts)).toBe(0)
  })

  it('handles negative balances (e.g. mortgage, credit card)', () => {
    const accounts = [
      { id: '1', balance: 10000, type: 'savings', include_in_net_worth: true, is_manual: false },
      { id: '2', balance: -200000, type: 'mortgage', include_in_net_worth: true, is_manual: false },
    ]
    expect(calcNetWorth(accounts)).toBe(-190000)
  })

  it('returns 0 for empty accounts list', () => {
    expect(calcNetWorth([])).toBe(0)
  })
})

describe('calcRetirementProgress', () => {
  it('returns correct percentage', () => {
    expect(calcRetirementProgress(250000, 500000)).toBe(50)
  })

  it('caps at 100 when net worth exceeds target', () => {
    expect(calcRetirementProgress(600000, 500000)).toBe(100)
  })

  it('returns 0 when target lump sum is 0', () => {
    expect(calcRetirementProgress(10000, 0)).toBe(0)
  })

  it('returns 0 when net worth is 0', () => {
    expect(calcRetirementProgress(0, 500000)).toBe(0)
  })
})

describe('calcYearsToRetirement', () => {
  it('returns years remaining to target age', () => {
    // Person born 1990-01-01, target age 57 → retires 2047
    const dob = '1990-01-01'
    const today = new Date()
    const expectedAge = 57 - (today.getFullYear() - 1990)
    const result = calcYearsToRetirement(dob, 57)
    // Allow ±1 for birthday boundary
    expect(result).toBeGreaterThanOrEqual(expectedAge - 1)
    expect(result).toBeLessThanOrEqual(expectedAge + 1)
  })

  it('returns 0 if already past retirement age', () => {
    expect(calcYearsToRetirement('1950-01-01', 57)).toBe(0)
  })

  it('returns null for null dob', () => {
    expect(calcYearsToRetirement(null, 57)).toBeNull()
  })
})

describe('calcRequiredMonthlySaving', () => {
  it('calculates monthly saving needed', () => {
    // Need £300k more over 25 years = £1000/month
    expect(calcRequiredMonthlySaving(200000, 500000, 25)).toBeCloseTo(1000, 0)
  })

  it('returns 0 when net worth already meets target', () => {
    expect(calcRequiredMonthlySaving(600000, 500000, 20)).toBe(0)
  })

  it('returns 0 when years to retirement is 0', () => {
    expect(calcRequiredMonthlySaving(100000, 500000, 0)).toBe(0)
  })
})

describe('sumByCategory', () => {
  const tx = (amount: number, category: string | null) => ({
    id: Math.random().toString(),
    amount,
    description: null,
    merchant_name: null,
    category,
    transaction_type: null,
    is_recurring: false,
    transacted_at: '2024-01-01T00:00:00Z',
  })

  it('groups debit transactions by category', () => {
    const result = sumByCategory([
      tx(-50, 'groceries'),
      tx(-30, 'groceries'),
      tx(-100, 'bills'),
    ])
    expect(result.groceries).toBeCloseTo(80)
    expect(result.bills).toBeCloseTo(100)
  })

  it('skips credit transactions', () => {
    const result = sumByCategory([tx(2000, 'salary'), tx(-50, 'groceries')])
    expect(result.salary).toBeUndefined()
    expect(result.groceries).toBeCloseTo(50)
  })

  it('falls back to "other" when category is null', () => {
    const result = sumByCategory([tx(-25, null)])
    expect(result.other).toBeCloseTo(25)
  })
})

describe('formatGBP', () => {
  it('formats positive amount', () => {
    expect(formatGBP(1234.5)).toBe('£1,234.50')
  })

  it('formats negative amount with leading minus', () => {
    expect(formatGBP(-500)).toBe('-£500.00')
  })

  it('formats zero', () => {
    expect(formatGBP(0)).toBe('£0.00')
  })
})
