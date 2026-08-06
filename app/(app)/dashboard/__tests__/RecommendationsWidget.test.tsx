import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecommendationsWidget from '../RecommendationsWidget'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockData = {
  summary: 'Your net worth looks healthy.',
  recommendations: [
    { title: 'Max ISA', detail: 'Use your remaining £10,000 allowance.', priority: 'high' },
    { title: 'Review cash', detail: 'Cash drag of £5,000.', priority: 'medium' },
    { title: 'Diversify', detail: 'Consider adding bonds.', priority: 'low' },
    { title: 'Pension top-up', detail: 'Add £200/month.', priority: 'medium' },
  ],
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
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockData,
    })
    render(<RecommendationsWidget />)
    await waitFor(() => expect(screen.getByText('Your net worth looks healthy.')).toBeInTheDocument())
    expect(screen.getByText('Max ISA')).toBeInTheDocument()
    expect(screen.getByText('Use your remaining £10,000 allowance.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: /ai investment recommendations/i })).toBeInTheDocument()
  })

  it('renders 4 recommendation items', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => mockData })
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
    mockFetch.mockResolvedValue({ ok: true, json: async () => mockData })
    render(<RecommendationsWidget />)
    await waitFor(() => screen.getByText('Max ISA'))
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }))
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockFetch).toHaveBeenCalledWith('/api/recommendations')
  })

  it('shows disclaimer text', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => mockData })
    render(<RecommendationsWidget />)
    await waitFor(() => screen.getByText(/educational only/i))
  })
})
