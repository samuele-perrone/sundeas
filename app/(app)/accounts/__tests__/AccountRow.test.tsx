import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AccountRow from '../AccountRow'

const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockOr = vi.fn().mockResolvedValue({ count: 0 })
const mockSelect = vi.fn().mockReturnValue({ or: mockOr })
const mockFrom = vi.fn(() => ({ update: mockUpdate, delete: mockDelete, select: mockSelect }))
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const acc = {
  id: 'acc-1',
  institution_name: null,
  name: 'Monzo',
  type: 'current',
  balance: 1500,
  interest_rate: null,
  rate_source: null,
  notes: null,
  is_manual: true,
  include_in_net_worth: true,
  connection_id: null,
}

describe('AccountRow', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders account name and balance', () => {
    render(<AccountRow acc={acc} />)
    expect(screen.getByText('Monzo')).toBeInTheDocument()
    expect(screen.getByText('£1,500.00')).toBeInTheDocument()
  })

  it('shows edit and delete buttons on hover (aria-label check)', () => {
    render(<AccountRow acc={acc} />)
    expect(screen.getByRole('button', { name: /edit monzo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /delete monzo/i })).toBeInTheDocument()
  })

  it('opens edit dialog on edit click', async () => {
    const user = userEvent.setup()
    render(<AccountRow acc={acc} />)
    await user.click(screen.getByRole('button', { name: /edit monzo/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /edit account/i })).toBeInTheDocument()
  })

  it('pre-fills edit form with current values', async () => {
    const user = userEvent.setup()
    render(<AccountRow acc={acc} />)
    await user.click(screen.getByRole('button', { name: /edit monzo/i }))
    expect(await screen.findByDisplayValue('Monzo')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1500')).toBeInTheDocument()
  })

  it('submits update and refreshes on save', async () => {
    const user = userEvent.setup()
    render(<AccountRow acc={acc} />)
    await user.click(screen.getByRole('button', { name: /edit monzo/i }))

    const nameInput = await screen.findByDisplayValue('Monzo')
    await user.clear(nameInput)
    await user.type(nameInput, 'Monzo Plus')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: 'Monzo Plus' }))
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('opens delete confirmation dialog', async () => {
    const user = userEvent.setup()
    render(<AccountRow acc={acc} />)
    await user.click(screen.getByRole('button', { name: /delete monzo/i }))
    expect(await screen.findByText(/permanently remove/i)).toBeInTheDocument()
  })

  it('calls delete and refreshes on confirm', async () => {
    const user = userEvent.setup()
    render(<AccountRow acc={acc} />)
    await user.click(screen.getByRole('button', { name: /delete monzo/i }))
    await user.click(await screen.findByRole('button', { name: /^delete$/i }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalled()
      expect(mockRefresh).toHaveBeenCalled()
    })
  })
})
