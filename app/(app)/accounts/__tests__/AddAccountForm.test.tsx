import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AddAccountForm from '../AddAccountForm'

const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn(() => ({ insert: mockInsert }))
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

describe('AddAccountForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInsert.mockResolvedValue({ error: null })
  })

  it('renders all form fields', () => {
    render(<AddAccountForm userId="user-1" />)
    expect(screen.getByPlaceholderText(/monzo current/i)).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('button', { name: /add account/i })).toBeInTheDocument()
  })

  it('submits correct payload and refreshes page', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)

    await user.type(screen.getByPlaceholderText(/monzo current/i), 'Nationwide Flex')
    await user.clear(screen.getByPlaceholderText('0.00'))
    await user.type(screen.getByPlaceholderText('0.00'), '2500.50')
    await user.click(screen.getByRole('button', { name: /add account/i }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nationwide Flex',
          balance: 2500.5,
          is_manual: true,
          currency: 'GBP',
          include_in_net_worth: true,
        })
      )
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('does not call insert when balance is empty (HTML5 required validation)', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)

    // Fill name only — leave balance empty (required field prevents submission)
    await user.type(screen.getByPlaceholderText(/monzo current/i), 'Test')
    await user.click(screen.getByRole('button', { name: /add account/i }))

    // HTML5 required validation blocks submit before our handler runs
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('shows supabase error message on insert failure', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'permission denied' } })
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)

    await user.type(screen.getByPlaceholderText(/monzo current/i), 'Test')
    await user.type(screen.getByPlaceholderText('0.00'), '100')
    await user.click(screen.getByRole('button', { name: /add account/i }))

    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
  })

  it('resets form after successful submit', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)

    const nameInput = screen.getByPlaceholderText(/monzo current/i)
    await user.type(nameInput, 'HSBC')
    await user.type(screen.getByPlaceholderText('0.00'), '1000')
    await user.click(screen.getByRole('button', { name: /add account/i }))

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(nameInput).toHaveValue('')
  })
})
