import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

// ---------------------------------------------------------------------------
// Mock @/lib/supabase/server before importing the route handler
// ---------------------------------------------------------------------------

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    }),
  ),
}))

// Import AFTER mock is set up
import { GET } from '../export/route'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockAccounts = [
  {
    institution_name: 'Vanguard',
    name: 'Stocks ISA',
    type: 'isa',
    balance: 15000,
    interest_rate: 7,
    notes: 'Global fund',
    include_in_net_worth: true,
  },
  {
    institution_name: 'Monzo',
    name: 'Current Account',
    type: 'current',
    balance: 3200,
    interest_rate: null,
    notes: '',
    include_in_net_worth: true,
  },
]

const mockRecurring: unknown[] = []

const mockGoals = [
  {
    target_retirement_age: 57,
    target_monthly_income: 3000,
    target_lump_sum: 900000,
    notes: 'Based on 4% SWR',
  },
]

const mockTodos = [
  {
    title: 'Review ISA',
    description: 'Check allocation',
    priority: 'high',
    due_date: '2025-04-05',
    completed_at: null,
    source: 'manual',
  },
  {
    title: 'Done task',
    description: '',
    priority: 'low',
    due_date: null,
    completed_at: '2025-01-01T00:00:00Z',
    source: 'ai',
  },
]

/**
 * Build a chainable query mock that resolves `data` at any terminal point.
 * The export route always ends with `.order(...)` so that becomes the terminal.
 */
function makeQueryChain(data: unknown[]) {
  const chain: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = vi.fn(() => Promise.resolve({ data, error: null }))
  }
  // Make chaining work: select → returns chain, eq → returns chain, order → resolves
  chain['select'] = vi.fn(() => chain)
  chain['eq'] = vi.fn(() => chain)
  chain['order'] = vi.fn(() => Promise.resolve({ data, error: null }))
  return chain
}

function setupAuthUser(id: string | null) {
  mockGetUser.mockResolvedValue({ data: { user: id ? { id } : null } })
}

function setupFromMock() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'accounts') return makeQueryChain(mockAccounts)
    if (table === 'recurring_payments') return makeQueryChain(mockRecurring)
    if (table === 'goals') return makeQueryChain(mockGoals)
    if (table === 'todos') return makeQueryChain(mockTodos)
    return makeQueryChain([])
  })
}

async function parseResponseAsXLSX(response: Response): Promise<XLSX.WorkBook> {
  const arrayBuffer = await response.arrayBuffer()
  const buf = Buffer.from(arrayBuffer)
  return XLSX.read(buf, { type: 'buffer' })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/backup/export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when user is not authenticated', async () => {
    setupAuthUser(null)
    setupFromMock()

    const response = await GET()

    expect(response.status).toBe(401)
    const body = await response.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns correct Content-Type and Content-Disposition headers', async () => {
    setupAuthUser('u1')
    setupFromMock()

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    const disposition = response.headers.get('Content-Disposition') ?? ''
    expect(disposition).toMatch(/^attachment; filename="sundeas-backup-\d{4}-\d{2}-\d{2}\.xlsx"$/)
  })

  it('XLSX file has exactly the expected sheet names', async () => {
    setupAuthUser('u1')
    setupFromMock()

    const response = await GET()
    const wb = await parseResponseAsXLSX(response)

    expect(wb.SheetNames).toEqual(['Accounts', 'Budget', 'Retirement Plan', 'Todos'])
  })

  it('Accounts sheet contains rows matching mock account data', async () => {
    setupAuthUser('u1')
    setupFromMock()

    const response = await GET()
    const wb = await parseResponseAsXLSX(response)

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Accounts'])

    expect(rows).toHaveLength(2)
    expect(rows[0].institution_name).toBe('Vanguard')
    expect(rows[0].name).toBe('Stocks ISA')
    expect(rows[0].type).toBe('isa')
    expect(rows[0].balance).toBe(15000)
    expect(rows[0].include_in_net_worth).toBe('true')

    expect(rows[1].institution_name).toBe('Monzo')
    expect(rows[1].name).toBe('Current Account')
    expect(rows[1].interest_rate).toBe('')
  })

  it('Todos sheet maps completed_at correctly to "true"/"false"', async () => {
    setupAuthUser('u1')
    setupFromMock()

    const response = await GET()
    const wb = await parseResponseAsXLSX(response)

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Todos'])

    expect(rows).toHaveLength(2)
    expect(rows[0].completed).toBe('false')
    expect(rows[1].completed).toBe('true')
  })

  it('Retirement Plan sheet has goal data', async () => {
    setupAuthUser('u1')
    setupFromMock()

    const response = await GET()
    const wb = await parseResponseAsXLSX(response)

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Retirement Plan'])

    expect(rows).toHaveLength(1)
    expect(rows[0].target_retirement_age).toBe(57)
    expect(rows[0].target_monthly_income).toBe(3000)
  })
})
