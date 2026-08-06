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

import { POST } from '../import/route'

// ---------------------------------------------------------------------------
// XLSX builder helpers
// ---------------------------------------------------------------------------

function buildXLSX(sheets: Record<string, Record<string, unknown>[]>): Buffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      wb,
      rows.length ? XLSX.utils.json_to_sheet(rows) : XLSX.utils.json_to_sheet([{}]),
      name,
    )
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

function makeXLSXFile(buf: Buffer, filename = 'test.xlsx'): File {
  return new File([buf], filename, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

function makeFormData(file: File | null): FormData {
  const fd = new FormData()
  if (file) fd.append('file', file)
  return fd
}

// ---------------------------------------------------------------------------
// Supabase mock factory
//
// Tracks inserts per table so tests can assert what rows were sent.
// ---------------------------------------------------------------------------

type InsertCapture = Record<string, unknown[][]>

function makeSupabaseMock(
  existingAccounts: { id: string; name: string }[] = [],
  insertCapture: InsertCapture = {},
  insertError: Record<string, string> = {},
) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

  mockFrom.mockImplementation((table: string) => {
    // Helper: capture insert rows
    const captureInsert = (rows: unknown[]) => {
      if (!insertCapture[table]) insertCapture[table] = []
      insertCapture[table].push(rows)
    }

    if (table === 'accounts') {
      return {
        // Initial "load existing accounts" select
        select: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: existingAccounts, error: null })),
        })),
        // Insert new accounts → return inserted with id/name
        insert: vi.fn((rows: unknown[]) => {
          captureInsert(rows)
          if (insertError[table]) {
            return Promise.resolve({ data: null, error: { message: insertError[table] } })
          }
          const withIds = (rows as Record<string, unknown>[]).map((r, i) => ({
            id: `inserted-acc-${i}`,
            name: r.name as string,
          }))
          return {
            select: vi.fn(() => Promise.resolve({ data: withIds, error: null })),
          }
        }),
      }
    }

    // Other tables: insert only
    return {
      insert: vi.fn((rows: unknown[]) => {
        captureInsert(rows)
        if (insertError[table]) {
          return Promise.resolve({ data: null, error: { message: insertError[table] } })
        }
        return Promise.resolve({ data: rows, error: null })
      }),
    }
  })
}

// ---------------------------------------------------------------------------
// Request factory
// ---------------------------------------------------------------------------

function makeRequest(formData: FormData) {
  return { formData: () => Promise.resolve(formData) } as unknown as Request
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/backup/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when no user is authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockFrom.mockReturnValue({})

    const req = makeRequest(makeFormData(null))
    const res = await POST(req as never)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 when no file is provided', async () => {
    makeSupabaseMock()

    const req = makeRequest(makeFormData(null))
    const res = await POST(req as never)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('No file provided')
  })

  it('returns summary with zeros when file has no valid rows', async () => {
    makeSupabaseMock()

    const buf = buildXLSX({
      Accounts: [],
      Budget: [],
      'Retirement Plan': [],
      Todos: [],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ accounts: 0, budget: 0, goals: 0, todos: 0 })
  })

  it('imports valid accounts and skips rows with missing name or invalid balance', async () => {
    const capture: InsertCapture = {}
    makeSupabaseMock([], capture)

    const buf = buildXLSX({
      Accounts: [
        // Valid
        { institution_name: 'Vanguard', name: 'ISA', type: 'isa', balance: 10000, interest_rate: '', notes: '', include_in_net_worth: 'true' },
        // Missing name → skip
        { institution_name: 'Monzo', name: '', type: 'current', balance: 500, interest_rate: '', notes: '', include_in_net_worth: 'true' },
        // Invalid balance → skip
        { institution_name: 'HSBC', name: 'Savings', type: 'savings', balance: 'not-a-number', interest_rate: '', notes: '', include_in_net_worth: 'true' },
      ],
      Budget: [],
      'Retirement Plan': [],
      Todos: [],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.accounts).toBe(1)

    const inserted = capture['accounts']?.[0] as Record<string, unknown>[]
    expect(inserted).toHaveLength(1)
    expect(inserted[0].name).toBe('ISA')
    expect(inserted[0].type).toBe('isa')
    expect(inserted[0].is_manual).toBe(true)
  })

  it('skips budget rows where account_name does not match any known account', async () => {
    const capture: InsertCapture = {}
    // existing account named 'ISA'
    makeSupabaseMock([{ id: 'acc-1', name: 'ISA' }], capture)

    const buf = buildXLSX({
      Accounts: [], // no new accounts
      Budget: [
        // Matches existing account → OK
        { account_name: 'ISA', name: 'Salary', type: 'income', amount: 3000, frequency: 'monthly', category: 'salary', payment_date: '', to_account_name: '' },
        // Unknown account → skip
        { account_name: 'Unknown Account', name: 'Rent', type: 'expense', amount: 1200, frequency: 'monthly', category: 'rent', payment_date: '', to_account_name: '' },
      ],
      'Retirement Plan': [],
      Todos: [],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.budget).toBe(1)

    const budgetRows = capture['recurring_payments']?.[0] as Record<string, unknown>[]
    expect(budgetRows).toHaveLength(1)
    expect(budgetRows[0].name).toBe('Salary')
    expect(budgetRows[0].account_id).toBe('acc-1')
  })

  it('correctly maps budget type "transfer"', async () => {
    const capture: InsertCapture = {}
    makeSupabaseMock([{ id: 'acc-1', name: 'Current' }, { id: 'acc-2', name: 'Savings' }], capture)

    const buf = buildXLSX({
      Accounts: [],
      Budget: [
        {
          account_name: 'Current',
          name: 'Transfer to savings',
          type: 'transfer',
          amount: 500,
          frequency: 'monthly',
          category: '',
          payment_date: '',
          to_account_name: 'Savings',
        },
      ],
      'Retirement Plan': [],
      Todos: [],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.budget).toBe(1)

    const budgetRows = capture['recurring_payments']?.[0] as Record<string, unknown>[]
    expect(budgetRows[0].type).toBe('transfer')
    expect(budgetRows[0].to_account_id).toBe('acc-2')
  })

  it('imports goals correctly', async () => {
    const capture: InsertCapture = {}
    makeSupabaseMock([], capture)

    const buf = buildXLSX({
      Accounts: [],
      Budget: [],
      'Retirement Plan': [
        { target_retirement_age: 57, target_monthly_income: 3000, target_lump_sum: 900000, notes: 'SWR plan' },
      ],
      Todos: [],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.goals).toBe(1)

    const goalRows = capture['goals']?.[0] as Record<string, unknown>[]
    expect(goalRows[0].target_retirement_age).toBe(57)
    expect(goalRows[0].target_monthly_income).toBe(3000)
    expect(goalRows[0].user_id).toBe('u1')
  })

  it('imports todos and sets completed_at when completed is "true"', async () => {
    const capture: InsertCapture = {}
    makeSupabaseMock([], capture)

    const buf = buildXLSX({
      Accounts: [],
      Budget: [],
      'Retirement Plan': [],
      Todos: [
        { title: 'Open ISA', description: 'Max out allowance', priority: 'high', due_date: '2025-04-05', completed: 'false', source: 'manual' },
        { title: 'Done thing', description: '', priority: 'low', due_date: '', completed: 'true', source: 'ai' },
        // Missing title → skip
        { title: '', description: 'No title', priority: 'medium', due_date: '', completed: 'false', source: 'manual' },
      ],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.todos).toBe(2)

    const todoRows = capture['todos']?.[0] as Record<string, unknown>[]
    expect(todoRows).toHaveLength(2)

    const pendingTodo = todoRows.find((r) => r.title === 'Open ISA')!
    expect(pendingTodo.completed_at).toBeNull()

    const doneTodo = todoRows.find((r) => r.title === 'Done thing')!
    expect(doneTodo.completed_at).not.toBeNull()
    expect(typeof doneTodo.completed_at).toBe('string')
  })

  it('returns summary counts for all imported entities', async () => {
    const capture: InsertCapture = {}
    makeSupabaseMock([], capture)

    const buf = buildXLSX({
      Accounts: [
        { institution_name: 'A', name: 'Acc1', type: 'savings', balance: 1000, interest_rate: '', notes: '', include_in_net_worth: 'true' },
        { institution_name: 'B', name: 'Acc2', type: 'current', balance: 500, interest_rate: '', notes: '', include_in_net_worth: 'true' },
      ],
      Budget: [],
      'Retirement Plan': [
        { target_retirement_age: 60, target_monthly_income: 2500, target_lump_sum: 750000, notes: '' },
      ],
      Todos: [
        { title: 'Todo 1', description: '', priority: 'medium', due_date: '', completed: 'false', source: 'manual' },
      ],
    })

    const req = makeRequest(makeFormData(makeXLSXFile(buf)))
    const res = await POST(req as never)

    const body = await res.json()
    expect(body.accounts).toBe(2)
    expect(body.budget).toBe(0)
    expect(body.goals).toBe(1)
    expect(body.todos).toBe(1)
  })
})
