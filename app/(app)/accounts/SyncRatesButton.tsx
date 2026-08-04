'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'

export default function SyncRatesButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const sync = async () => {
    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/accounts/sync-rates', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setResult(`Updated ${data.updated} of ${data.total} accounts`)
      router.refresh()
    } catch (e: unknown) {
      setResult(e instanceof Error ? e.message : 'Error syncing rates')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={sync} disabled={loading} className="gap-2">
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
        {loading ? 'Syncing rates…' : 'Sync rates'}
      </Button>
      {result && (
        <p className="text-xs text-muted-foreground">{result}</p>
      )}
    </div>
  )
}
