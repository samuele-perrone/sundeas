import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ---------------------------------------------------------------------------
// Mocks (declared before imports that trigger them)
// ---------------------------------------------------------------------------

const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

// Capture calls so tests can assert on the payload
const mockUpdate = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          update: vi.fn(() => ({ eq: mockEq })),
        }
      }
      // goals table
      return {
        update: mockUpdate,
        insert: mockInsert,
      }
    }),
  })),
}))

// Mock fetch for /api/goals/suggest
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import component AFTER mocks
import GoalForm from '../GoalForm'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  userId: 'user-1',
  existingGoal: null,
  profile: null,
}

function successfulSave() {
  mockInsert.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
  mockEq.mockResolvedValue({ error: null })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GoalForm — derived lump sum display', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "—" when monthly income input is empty', () => {
    render(<GoalForm {...defaultProps} />)

    // The derived pot display should show the dash when there's no income
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('shows £900,000 when monthly income is £3,000 (3000 × 12 / 0.04)', async () => {
    const user = userEvent.setup()
    render(<GoalForm {...defaultProps} />)

    const incomeInput = screen.getByLabelText(/monthly income target/i)
    await user.clear(incomeInput)
    await user.type(incomeInput, '3000')

    expect(screen.getByText('£900,000')).toBeInTheDocument()
  })

  it('shows £750,000 when monthly income is £2,500', async () => {
    const user = userEvent.setup()
    render(<GoalForm {...defaultProps} />)

    const incomeInput = screen.getByLabelText(/monthly income target/i)
    await user.clear(incomeInput)
    await user.type(incomeInput, '2500')

    expect(screen.getByText('£750,000')).toBeInTheDocument()
  })

  it('submits correct target_lump_sum derived from target_monthly_income', async () => {
    const user = userEvent.setup()
    successfulSave()

    render(<GoalForm {...defaultProps} />)

    const incomeInput = screen.getByLabelText(/monthly income target/i)
    await user.clear(incomeInput)
    await user.type(incomeInput, '3000')

    const submitBtn = screen.getByRole('button', { name: /save goal/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledOnce()
    })

    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>
    expect(payload.target_monthly_income).toBe(3000)
    expect(payload.target_lump_sum).toBe(900000) // Math.round(3000 * 12 / 0.04)
  })

  it('submits target_lump_sum=null when monthly income is empty', async () => {
    const user = userEvent.setup()
    successfulSave()

    render(<GoalForm {...defaultProps} />)

    // No income entered → lump sum should be null
    const submitBtn = screen.getByRole('button', { name: /save goal/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledOnce()
    })

    const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>
    expect(payload.target_monthly_income).toBeNull()
    expect(payload.target_lump_sum).toBeNull()
  })

  it('updates (not inserts) when existingGoal is provided', async () => {
    const user = userEvent.setup()

    const eqSpy = vi.fn().mockResolvedValue({ error: null })
    mockUpdate.mockReturnValue({ eq: eqSpy })
    mockEq.mockResolvedValue({ error: null })

    const existingGoal = {
      id: 'goal-1',
      target_retirement_age: 57,
      target_monthly_income: 2000,
      target_lump_sum: 600000,
      notes: null,
    }

    render(<GoalForm {...defaultProps} existingGoal={existingGoal} />)

    const submitBtn = screen.getByRole('button', { name: /update goal/i })
    await user.click(submitBtn)

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledOnce()
    })
    expect(mockInsert).not.toHaveBeenCalled()
    expect(eqSpy).toHaveBeenCalledWith('id', 'goal-1')
  })

  it('AI suggest button fills in monthly income and updates the derived pot', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ target_monthly_income: 2500, reasoning: 'Based on your spending' }),
    })

    render(<GoalForm {...defaultProps} />)

    // Pot should show dash initially
    expect(screen.getByText('—')).toBeInTheDocument()

    const aiBtn = screen.getByRole('button', { name: /calculate with ai/i })
    await user.click(aiBtn)

    // After the fetch resolves, income is 2500 → pot is £750,000
    await waitFor(() => {
      expect(screen.getByText('£750,000')).toBeInTheDocument()
    })

    // Reasoning text should also appear
    expect(screen.getByText('Based on your spending')).toBeInTheDocument()

    expect(mockFetch).toHaveBeenCalledWith('/api/goals/suggest', { method: 'POST' })
  })

  it('shows error message when AI suggest fetch fails', async () => {
    const user = userEvent.setup()

    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'AI unavailable' }),
    })

    render(<GoalForm {...defaultProps} />)

    const aiBtn = screen.getByRole('button', { name: /calculate with ai/i })
    await user.click(aiBtn)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('AI unavailable')
    })
  })

  it('calls router.refresh() after successful save', async () => {
    const user = userEvent.setup()
    successfulSave()

    render(<GoalForm {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: /save goal/i }))

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalledOnce()
    })
  })
})
