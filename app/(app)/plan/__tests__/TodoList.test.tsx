import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TodoList from '../TodoList'

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockResolvedValue({ error: null }),
})
const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn((table: string) => {
  if (table === 'todos') return { update: mockUpdate, insert: mockInsert }
  return {}
})
const mockRefresh = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ from: mockFrom }),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

const baseTodo = {
  description: null,
  due_date: null,
  source: 'manual',
}

const openTodo = { ...baseTodo, id: '1', title: 'Check pension', priority: 'high', completed_at: null }
const doneTodo = { ...baseTodo, id: '2', title: 'Review ISA', priority: 'low', completed_at: '2024-01-01T00:00:00Z' }

describe('TodoList', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders open todos', () => {
    render(<TodoList userId="u1" todos={[openTodo]} />)
    expect(screen.getByText('Check pension')).toBeInTheDocument()
  })

  it('shows empty state when no open items', () => {
    render(<TodoList userId="u1" todos={[]} />)
    expect(screen.getByText(/no open action items/i)).toBeInTheDocument()
  })

  it('shows completed count in summary', () => {
    render(<TodoList userId="u1" todos={[openTodo, doneTodo]} />)
    expect(screen.getByText(/1 completed/i)).toBeInTheDocument()
  })

  it('marks a todo complete on checkbox click', async () => {
    const user = userEvent.setup()
    render(<TodoList userId="u1" todos={[openTodo]} />)

    await user.click(screen.getByRole('button', { name: /mark.*complete/i }))

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ completed_at: expect.any(String) }))
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('adds a new todo via the form', async () => {
    const user = userEvent.setup()
    render(<TodoList userId="u1" todos={[]} />)

    await user.click(screen.getByRole('button', { name: /add action item/i }))
    await user.type(screen.getByRole('textbox', { name: /title/i }), 'Open a SIPP')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => {
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Open a SIPP', user_id: 'u1', source: 'manual' })
      )
      expect(mockRefresh).toHaveBeenCalled()
    })
  })

  it('priority badges are accessible', () => {
    render(<TodoList userId="u1" todos={[openTodo]} />)
    expect(screen.getByLabelText(/priority: high/i)).toBeInTheDocument()
  })
})
