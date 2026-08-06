import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockListUsers = vi.fn()
const mockSendEmail = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    auth: { admin: { listUsers: mockListUsers } },
  }),
}))

vi.mock('resend', () => ({
  Resend: function() { return { emails: { send: mockSendEmail } } },
}))

function makeRequest(secret?: string) {
  const headers: Record<string, string> = {}
  if (secret) headers['authorization'] = `Bearer ${secret}`
  return new NextRequest('http://localhost/api/cron/balance-reminder', { headers })
}

describe('GET /api/cron/balance-reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
    process.env.RESEND_API_KEY = 'test-key'
  })

  it('returns 401 without correct secret', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest('wrong-secret'))
    expect(res.status).toBe(401)
  })

  it('returns 401 with no secret', async () => {
    const { GET } = await import('../route')
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('sends emails and returns sent count', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ email: 'a@example.com' }, { email: 'b@example.com' }, { email: null }] },
      error: null,
    })
    mockSendEmail.mockResolvedValue({ id: 'email-id' })

    const { GET } = await import('../route')
    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.sent).toBe(2)
    expect(body.errors).toHaveLength(0)
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
  })

  it('collects errors from failed sends', async () => {
    mockListUsers.mockResolvedValue({
      data: { users: [{ email: 'fail@example.com' }] },
      error: null,
    })
    mockSendEmail.mockRejectedValue(new Error('send failed'))

    const { GET } = await import('../route')
    const res = await GET(makeRequest('test-secret'))
    const body = await res.json()

    expect(body.sent).toBe(0)
    expect(body.errors).toHaveLength(1)
    expect(body.errors[0]).toContain('fail@example.com')
  })

  it('returns 500 on listUsers error', async () => {
    mockListUsers.mockResolvedValue({ data: { users: [] }, error: { message: 'DB error' } })

    const { GET } = await import('../route')
    const res = await GET(makeRequest('test-secret'))
    expect(res.status).toBe(500)
  })
})
