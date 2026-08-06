const LIVE_BASE = 'https://live.trading212.com/api/v0'
const DEMO_BASE = 'https://demo.trading212.com/api/v0'

function buildAuthHeader(apiKey: string, apiSecret?: string): string {
  if (apiSecret) {
    return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`
  }
  return apiKey
}

async function t212Get(path: string, authHeader: string, base: string, retries = 3): Promise<unknown> {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: authHeader },
    cache: 'no-store',
  })
  if (res.status === 429 && retries > 0) {
    const wait = Number(res.headers.get('retry-after') ?? 5)
    await new Promise(r => setTimeout(r, wait * 1000))
    return t212Get(path, authHeader, base, retries - 1)
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`T212 ${res.status}: ${text}`)
  }
  return res.json()
}

export async function detectMode(
  apiKey: string,
  apiSecret?: string,
): Promise<{ mode: 'live' | 'demo'; authHeader: string }> {
  const auth = buildAuthHeader(apiKey.trim(), apiSecret?.trim() || undefined)

  for (const [base, mode] of [[LIVE_BASE, 'live'], [DEMO_BASE, 'demo']] as const) {
    const res = await fetch(`${base}/equity/portfolio`, {
      headers: { Authorization: auth },
      cache: 'no-store',
    })
    if (res.ok) return { mode, authHeader: auth }
  }

  const probe = await fetch(`${LIVE_BASE}/equity/portfolio`, {
    headers: { Authorization: auth },
    cache: 'no-store',
  })
  const body = await probe.text().catch(() => '')
  throw new Error(`T212 ${probe.status}: ${body || 'check your key and secret are correct'}`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncT212(supabase: any, connectionId: string, userId: string) {
  const { data: conn } = await supabase
    .from('connections')
    .select('id, api_key, institution_id')
    .eq('id', connectionId)
    .eq('user_id', userId)
    .single()

  if (!conn?.api_key) throw new Error('Connection not found')

  const base = conn.institution_id === 'demo' ? DEMO_BASE : LIVE_BASE
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cash = await t212Get('/equity/account/cash', conn.api_key, base) as any
  const totalBalance = cash.total

  // Calculate portfolio return % from ppl (unrealised P&L) / invested
  let returnRate: number | null = null
  if (cash.invested > 0 && cash.ppl != null) {
    returnRate = Math.round((cash.ppl / cash.invested) * 1000) / 10 // 1 decimal place
  }

  await supabase
    .from('accounts')
    .upsert({
      user_id: userId,
      connection_id: connectionId,
      truelayer_account_id: 'trading212-equity',
      institution_name: 'Trading 212',
      name: conn.institution_id === 'demo' ? 'Trading 212 (Demo)' : 'Trading 212',
      type: 'investment',
      currency: 'GBP',
      balance: totalBalance,
      interest_rate: returnRate,
      rate_source: returnRate !== null ? 'api' : null,
      is_manual: false,
      include_in_net_worth: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'connection_id,truelayer_account_id' })
    .select('id')
    .single()

  await supabase
    .from('connections')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('id', connectionId)

  return { balance: totalBalance, returnRate }
}
