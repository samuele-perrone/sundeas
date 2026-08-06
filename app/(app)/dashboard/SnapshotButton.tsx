'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Camera } from 'lucide-react'

type Account = { id: string; name: string; institution_name: string | null; type: string; balance: number | null }

function fmtDatetime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  })
}

export default function SnapshotButton({
  lastSnapshotAt,
  accounts = [],
}: {
  lastSnapshotAt?: string | null
  accounts?: Account[]
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Historical dialog state
  const [histOpen, setHistOpen] = useState(false)
  const [histDate, setHistDate] = useState('')
  const [histBalances, setHistBalances] = useState<Record<string, string>>({})

  const openHistorical = () => {
    // Pre-fill with current balances
    const prefill: Record<string, string> = {}
    for (const a of accounts) prefill[a.id] = a.balance !== null ? String(a.balance) : ''
    setHistBalances(prefill)
    setHistDate('')
    setHistOpen(true)
  }

  const take = async (customDate?: string, customBalances?: Record<string, number>) => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/snapshots/take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: customDate, balances: customBalances }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      const ts = customDate ?? new Date().toISOString()
      setSavedAt(ts)
      setResult(`Snapshot saved for ${data.snapshotted} account${data.snapshotted !== 1 ? 's' : ''}`)
      setHistOpen(false)
      router.refresh()
    } catch (e: unknown) {
      setResult(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const submitHistorical = () => {
    if (!histDate) return
    const balances: Record<string, number> = {}
    for (const [id, val] of Object.entries(histBalances)) {
      const n = parseFloat(val)
      if (!isNaN(n)) balances[id] = n
    }
    take(histDate, balances)
  }

  const displayAt = savedAt ?? lastSnapshotAt

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => take()}
          disabled={loading}
          className="gap-2"
        >
          <Camera className="w-3.5 h-3.5" aria-hidden="true" />
          {loading ? 'Saving…' : 'Snapshot now'}
        </Button>
        <button
          type="button"
          onClick={openHistorical}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          Add historical date
        </button>
      </div>

      {result && <p className="text-xs text-muted-foreground">{result}</p>}
      {displayAt && (
        <p className="text-xs text-muted-foreground">
          Last snapshot: {fmtDatetime(displayAt)}
        </p>
      )}

      {/* Historical snapshot dialog */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add historical snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="hist-date">Date</Label>
              <Input
                id="hist-date"
                type="date"
                value={histDate}
                max={new Date().toISOString().split('T')[0]}
                onChange={e => setHistDate(e.target.value)}
                className="w-48"
              />
            </div>

            {accounts.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Account balances on that date</p>
                <div className="space-y-2.5">
                  {accounts.map(a => (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{a.name}</p>
                        {a.institution_name && (
                          <p className="text-xs text-muted-foreground">{a.institution_name}</p>
                        )}
                      </div>
                      <div className="relative w-36 shrink-0">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                        <Input
                          type="number"
                          step="0.01"
                          value={histBalances[a.id] ?? ''}
                          onChange={e => setHistBalances(b => ({ ...b, [a.id]: e.target.value }))}
                          className="pl-6 h-8 text-sm"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave a field blank to skip that account for this snapshot.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistOpen(false)}>Cancel</Button>
            <Button onClick={submitHistorical} disabled={loading || !histDate}>
              {loading ? 'Saving…' : 'Save snapshot'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
