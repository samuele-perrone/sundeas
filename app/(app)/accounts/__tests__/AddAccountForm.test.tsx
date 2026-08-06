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
    expect(screen.getByPlaceholderText(/institution \(optional\)/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/account name/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
    expect(screen.getByRole('button', { name: /^add$/i })).toBeInTheDocument()
  })

  it('submits correct payload and refreshes page', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)

    await user.type(screen.getByPlaceholderText(/institution \(optional\)/i), 'Nationwide')
    await user.type(screen.getByPlaceholderText(/account name/i), 'Flex Saver')
    await user.type(screen.getByPlaceholderText('0.00'), '2500.50')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          institution_name: 'Nationwide',
          name: 'Flex Saver',
          balance: 2500.5,
          is_manual: true,
          currency: 'GBP',
          include_in_net_worth: true,
        })
      )
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('does not submit when account name is missing', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)
    await user.type(screen.getByPlaceholderText('0.00'), '100')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('shows validation error when balance is invalid', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)
    await user.type(screen.getByPlaceholderText(/account name/i), 'Test')
    // submit without balance
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/valid balance/i)).toBeInTheDocument()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('shows supabase error message on insert failure', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'permission denied' } })
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)
    await user.type(screen.getByPlaceholderText(/account name/i), 'Test')
    await user.type(screen.getByPlaceholderText('0.00'), '100')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    expect(await screen.findByText(/permission denied/i)).toBeInTheDocument()
  })

  it('resets form after successful submit', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)
    const nameInput = screen.getByPlaceholderText(/account name/i)
    await user.type(nameInput, 'HSBC')
    await user.type(screen.getByPlaceholderText('0.00'), '1000')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    expect(nameInput).toHaveValue('')
  })

  it('includes interest_rate when provided', async () => {
    const user = userEvent.setup()
    render(<AddAccountForm userId="user-1" />)
    await user.type(screen.getByPlaceholderText(/account name/i), 'ISA')
    await user.type(screen.getByPlaceholderText('0.00'), '10000')
    await user.type(screen.getByPlaceholderText('Rate (optional)'), '4.5')
    await user.click(screen.getByRole('button', { name: /^add$/i }))
    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ interest_rate: 4.5, rate_source: 'manual' })
      )
    })
  })
})
