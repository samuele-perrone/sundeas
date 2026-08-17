'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Download, Upload, FileSpreadsheet } from 'lucide-react'

type Results = { accounts: number; budget: number; goals: number; todos: number; errors: string[] }

export default function BackupSection() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const handleExport = async () => {
    setExporting(true)
    setMsg(null)
    try {
      const res = await fetch('/api/backup/export')
      if (!res.ok) throw new Error('Export failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sundeas-backup-${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      setMsg({ text: 'Backup downloaded', ok: true })
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Export failed', ok: false })
    } finally {
      setExporting(false)
    }
  }

  const handleTemplate = async () => {
    const res = await fetch('/api/backup/template')
    if (!res.ok) return
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sundeas-import-template.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setMsg(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/backup/import', { method: 'POST', body: formData })
      const data: Results = await res.json()
      if (!res.ok) throw new Error((data as unknown as { error: string }).error ?? 'Import failed')
      const parts = [
        data.accounts && `${data.accounts} account${data.accounts !== 1 ? 's' : ''}`,
        data.budget && `${data.budget} budget item${data.budget !== 1 ? 's' : ''}`,
        data.goals && `${data.goals} goal${data.goals !== 1 ? 's' : ''}`,
        data.todos && `${data.todos} action${data.todos !== 1 ? 's' : ''}`,
      ].filter(Boolean)
      const summary = parts.length ? `Imported: ${parts.join(', ')}` : 'Nothing to import'
      const errNote = data.errors?.length ? ` (${data.errors.join('; ')})` : ''
      setMsg({ text: summary + errNote, ok: !data.errors?.length })
      router.refresh()
    } catch (err) {
      setMsg({ text: err instanceof Error ? err.message : 'Import failed', ok: false })
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Export */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Export backup</p>
          </div>
          <p className="text-xs text-muted-foreground">Downloads an Excel file with all your data across four sheets: Accounts, Budget, Retirement Plan, and Todos.</p>
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleExport} disabled={exporting}>
            <Download className="w-3.5 h-3.5" />
            {exporting ? 'Exporting…' : 'Download backup'}
          </Button>
        </div>

        {/* Import */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Restore from backup</p>
          </div>
          <p className="text-xs text-muted-foreground">Upload a previously exported backup or filled-in template. Data is added — existing records are not overwritten.</p>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => fileRef.current?.click()} disabled={importing}>
            <Upload className="w-3.5 h-3.5" />
            {importing ? 'Importing…' : 'Upload file'}
          </Button>
        </div>

        {/* Template */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <p className="text-sm font-medium">Import template</p>
          </div>
          <p className="text-xs text-muted-foreground">Download a blank template with one example row per sheet. Fill it in and upload above to bulk-import your data.</p>
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={handleTemplate}>
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Download template
          </Button>
        </div>
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? 'text-emerald-600' : 'text-destructive'}`}>{msg.text}</p>
      )}

      <p className="text-xs text-muted-foreground">
        The backup covers manual accounts, budget items, retirement goals, and action todos. Trading 212 balances are excluded as they sync live from the app.
      </p>
    </div>
  )
}
