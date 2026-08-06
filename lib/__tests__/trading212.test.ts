import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectMode, syncT212 } from '../trading212'

// ---------------------------------------------------------------------------
// fetch mock helpers
// ---------------------------------------------------------------------------

function mockFetchResponse(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k: string) => headers[k] ?? null },
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  }
}

// ---------------------------------------------------------------------------
// Supabase chain mock builder
// ---------------------------------------------------------------------------

/**
 * Builds a minimal chainable Supabase mock.
 *
 * Usage:
 *   makeSupabaseMock({ 'connections': { data: conn }, 'accounts': { data: account } })
 *
 * Every `.from(table)` returns a fluent builder. Terminal methods resolve the
 * configured data for that table. `.upsert()` and `.update()` also need to
 * chain `.select().single()` or `.eq()`, so they return `this` too.
 */
function makeSupabaseMock(tableData: Record<string, { data: unknown; error?: unknown }>) {
  function makeChain(table: string) {
    const result = tableData[table] ?? { data: null, error: null }

    const chain: Record<string, unknown> = {}

    const self = () => chain

    // All intermediate methods return `this` (the chain object).
    for (const method of ['select', 'eq', 'order', 'update', 'upsert', 'insert']) {
      chain[method] = vi.fn(() => chain)
    }

    // Terminal: `.single()` resolves the configured data
    chain['single'] = vi.fn(() => Promise.resolve(result))

    return chain
  }

  return {
    from: vi.fn((table: string) => makeChain(table)),
  }
}

// ---------------------------------------------------------------------------
// detectMode
// ---------------------------------------------------------------------------

describe('detectMode', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('resolves live mode when live endpoint returns 200', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(200)))

    const result = await detectMode('myApiKey')

    expect(result.mode).toBe('live')
    // The auth header is the raw key when no secret is provided
    expect(result.authHeader).toBe('myApiKey')
  })

  it('resolves demo mode when live returns 401 and demo returns 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        // First call: live probe → 401
        .mockResolvedValueOnce(mockFetchResponse(401))
        // Second call: demo probe → 200
        .mockResolvedValueOnce(mockFetchResponse(200)),
    )

    const result = await detectMode('myApiKey')

    expect(result.mode).toBe('demo')
    expect(result.authHeader).toBe('myApiKey')
  })

  it('throws when both live and demo return non-ok status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        // live probe → 401
        .mockResolvedValueOnce(mockFetchResponse(401))
        // demo probe → 403
        .mockResolvedValueOnce(mockFetchResponse(403))
        // final probe to extract error message → 401 again
        .mockResolvedValueOnce(mockFetchResponse(401, 'bad key')),
    )

    await expect(detectMode('badKey')).rejects.toThrow(/401/)
  })

  it('builds a Basic auth header when apiSecret is provided', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockFetchResponse(200)))

    const result = await detectMode('key', 'secret')

    const expected = `Basic ${Buffer.from('key:secret').toString('base64')}`
    expect(result.authHeader).toBe(expected)
  })
})

// ---------------------------------------------------------------------------
// syncT212
// ---------------------------------------------------------------------------

describe('syncT212', () => {
  const connectionId = 'conn-1'
  const userId = 'user-1'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  function makeFetchWithCash(cashPayload: Record<string, number>) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(mockFetchResponse(200, cashPayload)),
    )
  }

  function makeSupabaseWithConn(
    conn: Record<string, unknown>,
    upsertResult: unknown = { id: 'account-1' },
  ) {
    // We need per-table control, so build the mock manually.
    const connectionsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: conn, error: null }),
    }

    const accountsChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: upsertResult, error: null }),
    }

    const updateConnectionChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'connections') {
          // First call: .select().eq().eq().single() — reading the connection
          // Subsequent call: .update().eq() — writing last_synced_at
          // We detect by whether .select was called first.
          return {
            select: vi.fn().mockReturnValue(connectionsChain),
            update: vi.fn().mockReturnValue(updateConnectionChain),
          }
        }
        if (table === 'accounts') return accountsChain
        return {}
      }),
    }

    return supabase
  }

  it('fetches cash balance and returns { balance, returnRate: null } when invested is 0', async () => {
    makeFetchWithCash({ total: 1500, invested: 0, ppl: 0 })

    const conn = { api_key: 'liveKey', institution_id: 'live' }
    const supabase = makeSupabaseWithConn(conn)

    const result = await syncT212(supabase, connectionId, userId)

    expect(result.balance).toBe(1500)
    expect(result.returnRate).toBeNull()
  })

  it('calculates returnRate from ppl/invested (ppl=100, invested=1000 → 10%)', async () => {
    makeFetchWithCash({ total: 2000, invested: 1000, ppl: 100 })

    const conn = { api_key: 'liveKey', institution_id: 'live' }
    const supabase = makeSupabaseWithConn(conn)

    const result = await syncT212(supabase, connectionId, userId)

    expect(result.balance).toBe(2000)
    expect(result.returnRate).toBe(10) // 100/1000 * 100 = 10.0
  })

  it('upserts account with correct balance and type=investment', async () => {
    makeFetchWithCash({ total: 5000, invested: 2000, ppl: 200 })

    const conn = { api_key: 'liveKey', institution_id: 'live' }
    const accountsChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'acc-1' }, error: null }),
    }

    const updateConnectionChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    const connectionsReadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: conn, error: null }),
    }

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') return accountsChain
        if (table === 'connections') {
          return {
            select: vi.fn().mockReturnValue(connectionsReadChain),
            update: vi.fn().mockReturnValue(updateConnectionChain),
          }
        }
        return {}
      }),
    }

    await syncT212(supabase, connectionId, userId)

    const upsertCall = accountsChain.upsert.mock.calls[0][0]
    expect(upsertCall.balance).toBe(5000)
    expect(upsertCall.type).toBe('investment')
    expect(upsertCall.is_manual).toBe(false)
    expect(upsertCall.include_in_net_worth).toBe(true)
  })

  it('updates last_synced_at on the connection after sync', async () => {
    makeFetchWithCash({ total: 999, invested: 0, ppl: 0 })

    const conn = { api_key: 'liveKey', institution_id: 'live' }

    const eqSpy = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateSpy = vi.fn().mockReturnValue({ eq: eqSpy })

    const accountsChain = {
      upsert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'acc-1' }, error: null }),
    }

    const connectionsReadChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: conn, error: null }),
    }

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'accounts') return accountsChain
        if (table === 'connections') {
          return {
            select: vi.fn().mockReturnValue(connectionsReadChain),
            update: updateSpy,
          }
        }
        return {}
      }),
    }

    await syncT212(supabase, connectionId, userId)

    expect(updateSpy).toHaveBeenCalledOnce()
    const updateArg = updateSpy.mock.calls[0][0] as { last_synced_at: string }
    expect(updateArg.last_synced_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(eqSpy).toHaveBeenCalledWith('id', connectionId)
  })

  it('throws when connection is not found', async () => {
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      })),
    }

    await expect(syncT212(supabase, connectionId, userId)).rejects.toThrow('Connection not found')
  })
})
