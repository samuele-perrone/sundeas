'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RefreshCw, Link2Off, TrendingUp } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { createClient } from '@/lib/supabase/client'
import { formatGBP } from '@/lib/finance'

type Connection = { id: string; last_synced_at: string | null }
type Account = { id: string; name: string; type: string; balance: number | null; interest_rate: number | null }

function fmtSync(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London',
  })
}

export default function Trading212Section({
  connection,
  account,
}: {
  connection: Connection | null
  account: Account | null
}) {
  const router = useRouter()
  const [keyId, setKeyId] = useState('')
  const [secret, setSecret] = useState('')
  const [accountType, setAccountType] = useState<'isa' | 'invest'>('isa')
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const connect = async (e: React.FormEvent) => {
    e.preventDefault()
    setConnecting(true)
    setMsg(null)
    try {
      const res = await fetch('/api/trading212/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId, secret, accountType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setMsg({ text: `Connected — portfolio value ${formatGBP(data.balance)}`, ok: true })
      setKeyId('')
      setSecret('')
      router.refresh()
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Failed', ok: false })
    } finally {
      setConnecting(false)
    }
  }

  const sync = async () => {
    if (!connection) return
    setSyncing(true)
    setMsg(null)
    try {
      const res = await fetch('/api/trading212/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: connection.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      setMsg({ text: `Synced — ${formatGBP(data.balance)}`, ok: true })
      router.refresh()
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Sync failed', ok: false })
    } finally {
      setSyncing(false)
    }
  }

  const disconnect = async () => {
    if (!connection) return
    setDisconnecting(true)
    const supabase = createClient()
    await supabase.from('connections').delete().eq('id', connection.id)
    setDisconnecting(false)
    setConfirmOpen(false)
    router.refresh()
  }

  return (
    <section aria-label="Trading 212" className="mb-6">
      <Card className={connection ? 'border-indigo-200' : undefined}>
        <CardHeader className={`pb-3 rounded-t-xl border-b ${connection ? 'bg-indigo-50/60 border-indigo-100' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <TrendingUp className={`w-4 h-4 ${connection ? 'text-indigo-600' : 'text-muted-foreground'}`} aria-hidden="true" />
              <span className="font-semibold text-sm">Trading 212</span>
              {connection
                ? <Badge variant="outline" className="text-[10px] border-indigo-300 text-indigo-700 bg-indigo-50">Connected</Badge>
                : <Badge variant="secondary" className="text-[10px]">Not connected</Badge>
              }
            </div>

            {connection && (
              <div className="flex items-center gap-3">
                {msg && (
                  <span className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</span>
                )}
                {!msg && connection.last_synced_at && (
                  <span className="text-xs text-muted-foreground">Synced {fmtSync(connection.last_synced_at)}</span>
                )}
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={sync} disabled={syncing}>
                  <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
                  {syncing ? 'Syncing…' : 'Sync'}
                </Button>
                <Button
                  variant="ghost" size="sm"
                  className="h-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                  aria-label="Disconnect Trading 212"
                >
                  <Link2Off className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className={connection ? 'p-0' : 'pt-4'}>
          {connection ? (
            account && (
              <>
                <div className="flex items-center justify-between px-6 py-4">
                  <div>
                    <p className="text-sm font-medium">{account.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {account.type === 'investment' ? 'Invest account' : 'Stocks & Shares ISA'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{formatGBP(account.balance ?? 0)}</p>
                    {account.interest_rate != null && (
                      <p className="text-xs font-medium text-indigo-600 tabular-nums mt-0.5">
                        {account.interest_rate > 0 ? '+' : ''}{account.interest_rate}% total return
                      </p>
                    )}
                    {account.interest_rate != null && (account.balance ?? 0) > 0 && (
                      <p className="text-[11px] text-emerald-600 tabular-nums">
                        +{formatGBP(Math.round((account.balance! * account.interest_rate / 100) / 12 * 100) / 100)}/mo est.
                      </p>
                    )}
                  </div>
                </div>
                <Separator />
                <p className="px-6 py-3 text-xs text-muted-foreground">
                  Total portfolio value including invested positions and free cash. Return % synced live from Trading 212.
                </p>
              </>
            )
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 border border-border px-4 py-3 space-y-2.5">
                <p className="text-sm font-medium">How to get your API credentials</p>
                <ol className="text-xs text-muted-foreground space-y-1.5 list-none">
                  <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">1.</span>Open the <strong className="text-foreground">Trading 212 app</strong> on your phone</li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">2.</span>Tap the <strong className="text-foreground">menu icon</strong> (top-left or bottom-right depending on your version)</li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">3.</span>Go to <strong className="text-foreground">Settings → API (Beta)</strong></li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">4.</span>Tap <strong className="text-foreground">Generate Key</strong> — this creates a Key ID and a Secret Key</li>
                  <li className="flex gap-2"><span className="font-semibold text-foreground shrink-0">5.</span>Copy both and paste them below. The secret is only shown once.</li>
                </ol>
              </div>
              <form onSubmit={connect} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="t212-account-type">Account type</Label>
                  <Select value={accountType} onValueChange={v => setAccountType(v as 'isa' | 'invest')}>
                    <SelectTrigger id="t212-account-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="isa">Stocks &amp; Shares ISA</SelectItem>
                      <SelectItem value="invest">Invest account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t212-key-id">API Key ID</Label>
                  <Input
                    id="t212-key-id"
                    placeholder="Key ID"
                    value={keyId}
                    onChange={e => setKeyId(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="t212-secret">Secret Key</Label>
                  <Input
                    id="t212-secret"
                    type="password"
                    placeholder="Secret key"
                    value={secret}
                    onChange={e => setSecret(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={connecting || !secret.trim()} className="w-full">
                  {connecting ? 'Connecting…' : 'Connect'}
                </Button>
              </form>
              {msg && (
                <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Trading 212?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the API key and connection. Your existing portfolio account record will remain as a manual account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={disconnect}
              disabled={disconnecting}
              className="bg-destructive text-white hover:bg-red-700"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
