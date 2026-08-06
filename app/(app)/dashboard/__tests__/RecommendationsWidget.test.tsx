import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecommendationsWidget from '../RecommendationsWidget'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// crypto.randomUUID is available in jsdom
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' })

const mockData = {
  summary: 'Your net worth looks healthy.',
  recommendations: [
    { title: 'Max ISA', detail: 'Use your remaining £10,000 allowance.', priority: 'high' },
    { title: 'Review cash', detail: 'Cash drag of £5,000.', priority: 'medium' },
    { title: 'Diversify', detail: 'Consider adding bonds.', priority: 'low' },
    { title: 'Pension top-up', detail: 'Add £200/month.', priority: 'medium' },
  ],
}

function setupFetch(data = mockData) {
  mockFetch.mockResolvedValue({ ok: true, json: async () => data })
}

describe('RecommendationsWidget', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading skeleton initially', () => {
    mockFetch.mockReturnValue(new Promise(() => {}))
    render(<RecommendationsWidget />)
    expect(document.querySelector('.animate-pulse')).toBeTruthy()
    expect(screen.queryByRole('list', { name: /recommendations/i })).toBeNull()
  })

  it('renders summary and recommendations after load', async () => {
    setupFetch()
    render(<RecommendationsWidget />)
    await waitFor(() => expect(screen.getByText('Your net worth looks healthy.')).toBeInTheDocument())
    expect(screen.getByText('Max ISA')).toBeInTheDocument()
    expect(screen.getByText('Use your remaining £10,000 allowance.')).toBeInTheDocument()
  })

  it('renders 4 recommendation items', async () => {
    setupFetch()
    render(<RecommendationsWidget />)
    await waitFor(() => screen.getByRole('list', { name: /recommendations/i }))
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('shows error state on failed fetch', async () => {
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({}) })
    render(<RecommendationsWidget />)
    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeInTheDocument())
  })

  it('shows error state when recommendations array is empty', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ summary: '', recommendations: [] }) })
    render(<RecommendationsWidget />)
    await waitFor(() => expect(screen.getByText(/could not load/i)).toBeInTheDocument())
  })

  it('refreshes on button click', async () => {
    setupFetch()
    render(<RecommendationsWidget />)
    await waitFor(() => screen.getByText('Max ISA'))
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  describe('Reply flow', () => {
    it('shows Reply button for each recommendation', async () => {
      setupFetch()
      render(<RecommendationsWidget />)
      await waitFor(() => screen.getByText('Max ISA'))
      expect(screen.getAllByText('Reply')).toHaveLength(4)
    })

    it('opens textarea on Reply click', async () => {
      setupFetch()
      render(<RecommendationsWidget />)
      await waitFor(() => screen.getByText('Max ISA'))
      await userEvent.click(screen.getAllByText('Reply')[0])
      expect(screen.getByPlaceholderText(/ask a follow-up/i)).toBeInTheDocument()
    })

    it('sends reply to /api/chat/messages with recommendation context', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData }) // initial load
        .mockResolvedValueOnce({ ok: true }) // POST reply

      render(<RecommendationsWidget />)
      await waitFor(() => screen.getByText('Max ISA'))

      await userEvent.click(screen.getAllByText('Reply')[0])
      await userEvent.type(screen.getByPlaceholderText(/ask a follow-up/i), 'Tell me more about ISA limits')
      await userEvent.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2))

      const [url, options] = mockFetch.mock.calls[1]
      expect(url).toBe('/api/chat/messages')
      const body = JSON.parse(options.body)
      expect(body.messages[0].role).toBe('assistant')
      expect(body.messages[0].content).toContain('Max ISA')
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content).toBe('Tell me more about ISA limits')
    })

    it('shows confirmation after sending', async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData })
        .mockResolvedValueOnce({ ok: true })

      render(<RecommendationsWidget />)
      await waitFor(() => screen.getByText('Max ISA'))
      await userEvent.click(screen.getAllByText('Reply')[0])
      await userEvent.type(screen.getByPlaceholderText(/ask a follow-up/i), 'Good point')
      await userEvent.click(screen.getByRole('button', { name: /send/i }))

      await waitFor(() => expect(screen.getByText(/saved to advisor/i)).toBeInTheDocument())
    })

    it('cancels reply and clears text', async () => {
      setupFetch()
      render(<RecommendationsWidget />)
      await waitFor(() => screen.getByText('Max ISA'))
      await userEvent.click(screen.getAllByText('Reply')[0])
      await userEvent.type(screen.getByPlaceholderText(/ask a follow-up/i), 'Hello')
      await userEvent.click(screen.getByText('Cancel'))
      expect(screen.queryByPlaceholderText(/ask a follow-up/i)).toBeNull()
    })
  })
})
