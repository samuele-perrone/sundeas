'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

type Mode = 'data' | 'account'

export default function DeleteAccountSection() {
  const [mode, setMode] = useState<Mode>('data')
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataDeleted, setDataDeleted] = useState(false)

  function openDialog(m: Mode) {
    setMode(m)
    setOpen(true)
    setConfirmation('')
    setError(null)
  }

  async function handleConfirm() {
    setLoading(true)
    setError(null)

    if (mode === 'data') {
      const res = await fetch('/api/account/delete-data', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Something went wrong')
        setLoading(false)
        return
      }
      setDataDeleted(true)
      setOpen(false)
    } else {
      const res = await fetch('/api/account/delete', { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Something went wrong')
        setLoading(false)
        return
      }
      const supabase = createClient()
      await supabase.auth.signOut()
      window.location.href = '/login'
    }

    setLoading(false)
  }

  return (
    <>
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
          <p className="text-sm text-muted-foreground mt-1">These actions are permanent and cannot be undone.</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-md border border-destructive/20 bg-background p-4 space-y-2">
            <p className="text-sm font-medium">Delete all data</p>
            <p className="text-xs text-muted-foreground">Wipes all accounts, balances, transactions, goals and settings. Your login is kept.</p>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
              onClick={() => openDialog('data')}
              disabled={dataDeleted}
            >
              {dataDeleted ? 'Data deleted' : 'Delete all data'}
            </Button>
          </div>

          <div className="flex-1 rounded-md border border-destructive/20 bg-background p-4 space-y-2">
            <p className="text-sm font-medium">Close account</p>
            <p className="text-xs text-muted-foreground">Permanently deletes your account and all data. You will be signed out immediately.</p>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => openDialog('account')}
            >
              Delete account
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {mode === 'data' ? 'Delete all data' : 'Close account'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === 'data'
                ? 'This will permanently delete all your accounts, balances, transactions, goals, and settings. Your login will be kept but your app will be empty.'
                : 'This will permanently delete your account and all associated data. You will be signed out and cannot log back in.'}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-2 space-y-2">
            <p className="text-sm font-medium">Type <span className="font-mono font-bold">DELETE</span> to confirm</p>
            <Input
              value={confirmation}
              onChange={e => setConfirmation(e.target.value)}
              placeholder="DELETE"
              autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={confirmation !== 'DELETE' || loading}
              onClick={handleConfirm}
            >
              {loading ? 'Deleting…' : mode === 'data' ? 'Delete all data' : 'Delete my account'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
