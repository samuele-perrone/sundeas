'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Camera } from 'lucide-react'

export default function SnapshotButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [date, setDate] = useState('')
  const [result, setResult] = useState<string | null>(null)

  const take = async (customDate?: string) => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/snapshots/take', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: customDate }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult(`Snapshot saved for ${data.snapshotted} account${data.snapshotted !== 1 ? 's' : ''}`)
      setShowDatePicker(false)
      setDate('')
      router.refresh()
    } catch (e: unknown) {
      setResult(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
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
          onClick={() => setShowDatePicker(v => !v)}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
        >
          {showDatePicker ? 'Cancel' : 'Add historical date'}
        </button>
      </div>

      {showDatePicker && (
        <div className="flex items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label htmlFor="snapshot-date" className="text-xs">Date</Label>
            <Input
              id="snapshot-date"
              type="date"
              value={date}
              max={new Date().toISOString().split('T')[0]}
              onChange={e => setDate(e.target.value)}
              className="h-8 text-sm w-40"
            />
          </div>
          <Button
            size="sm"
            onClick={() => date && take(date)}
            disabled={loading || !date}
            className="h-8"
          >
            Save
          </Button>
        </div>
      )}

      {result && <p className="text-xs text-muted-foreground">{result}</p>}
    </div>
  )
}
