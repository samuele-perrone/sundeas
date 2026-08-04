'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { formatGBP } from '@/lib/finance'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2, Link2 } from 'lucide-react'
import { Textarea } from '@/components/ui/textarea'

const ACCOUNT_TYPES = [
  { value: 'current', label: 'Current account' },
  { value: 'savings', label: 'Savings' },
  { value: 'isa', label: 'ISA' },
  { value: 'pension', label: 'Pension' },
  { value: 'investment', label: 'Investment' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'other', label: 'Other' },
]

type Account = {
  id: string
  institution_name: string | null
  name: string
  type: string
  balance: number | null
  interest_rate: number | null
  rate_source: string | null
  notes: string | null
  is_manual: boolean
  include_in_net_worth: boolean
}

function rateLabel(type: string): string {
  if (type === 'mortgage' || type === 'credit_card') return '% p.a.'
  if (type === 'pension' || type === 'investment') return '% p.a. est.'
  return '% AER'
}

export default function AccountRow({ acc }: { acc: Account }) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    institution_name: acc.institution_name ?? '',
    name: acc.name,
    type: acc.type,
    balance: String(acc.balance ?? ''),
    interest_rate: acc.interest_rate !== null ? String(acc.interest_rate) : '',
    notes: acc.notes ?? '',
    include_in_net_worth: acc.include_in_net_worth,
  })

  const set = (field: string, value: string | boolean | null) =>
    setForm(f => ({ ...f, [field]: value ?? '' }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const balance = parseFloat(form.balance)
    if (isNaN(balance)) {
      setError('Enter a valid balance.')
      setSaving(false)
      return
    }
    const interest_rate = form.interest_rate !== '' ? parseFloat(form.interest_rate) : null
    if (form.interest_rate !== '' && (interest_rate === null || isNaN(interest_rate!))) {
      setError('Enter a valid rate or leave blank.')
      setSaving(false)
      return
    }
    const supabase = createClient()
    const { error: err } = await supabase.from('accounts').update({
      institution_name: form.institution_name.trim() || null,
      name: form.name.trim(),
      type: form.type,
      balance,
      interest_rate: interest_rate ?? null,
      rate_source: interest_rate !== null ? 'manual' : acc.rate_source,
      notes: form.notes.trim() || null,
      include_in_net_worth: form.include_in_net_worth,
      updated_at: new Date().toISOString(),
    }).eq('id', acc.id)
    if (err) { setError(err.message); setSaving(false); return }
    setSaving(false)
    setEditOpen(false)
    router.refresh()
  }

  const handleDelete = async () => {
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('accounts').delete().eq('id', acc.id)
    setDeleting(false)
    setDeleteOpen(false)
    router.refresh()
  }

  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 group">
        <div className="min-w-0">
          <p className="text-sm font-medium">{acc.name}</p>
          {acc.institution_name && (
            <p className="text-xs text-muted-foreground mt-0.5">{acc.institution_name}</p>
          )}
          {acc.notes && (/https?:\/\//.test(acc.notes) ? (
            <span className="inline-flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <Link2 className="w-3 h-3 shrink-0" aria-hidden="true" />
              <span className="sr-only">Has linked URL for rate sync</span>
            </span>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 italic truncate max-w-xs">{acc.notes}</p>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-4 shrink-0">
          <div className="text-right">
            <p className={`text-sm font-semibold tabular-nums ${(acc.balance ?? 0) < 0 ? 'text-destructive' : 'text-foreground'}`}>
              {formatGBP(acc.balance ?? 0)}
            </p>
            <div className="flex items-center justify-end gap-1.5 mt-1">
              {acc.interest_rate !== null && (
                <span className="text-xs font-medium text-indigo-600 tabular-nums">
                  {acc.interest_rate}%
                  <span className="text-[10px] text-muted-foreground font-normal ml-0.5">
                    {rateLabel(acc.type).replace('%', '').trim()}
                  </span>
                </span>
              )}
              {acc.is_manual && (
                <Badge variant="secondary" className="text-[10px]">Manual</Badge>
              )}
              {acc.interest_rate !== null && acc.rate_source === 'ai' && (
                <Badge variant="outline" className="text-[10px] border-indigo-200 text-indigo-500">AI</Badge>
              )}
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Edit ${acc.name}`}
              onClick={() => setEditOpen(true)}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Delete ${acc.name}`}
              onClick={() => setDeleteOpen(true)}
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit account</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5 pt-2">

            <div className="space-y-2">
              <Label htmlFor="edit-institution">Institution</Label>
              <Input
                id="edit-institution"
                placeholder="e.g. Vanguard, Hargreaves Lansdown"
                value={form.institution_name}
                onChange={e => set('institution_name', e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Account name</Label>
                <Input
                  id="edit-name"
                  required
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-type">Type</Label>
                <Select value={form.type} onValueChange={v => v && set('type', v)}>
                  <SelectTrigger id="edit-type" className="w-full">
                    <SelectValue>
                      {ACCOUNT_TYPES.find(t => t.value === form.type)?.label}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-balance">Balance (£)</Label>
                <Input
                  id="edit-balance"
                  required
                  type="number"
                  step="0.01"
                  value={form.balance}
                  onChange={e => set('balance', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-rate">
                  Interest rate (%)
                  <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
                </Label>
                <Input
                  id="edit-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="e.g. 4.5"
                  value={form.interest_rate}
                  onChange={e => set('interest_rate', e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                rows={3}
                placeholder="e.g. Fixed rate until Dec, or paste a URL for rate sync"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="edit-include-nw"
                checked={form.include_in_net_worth}
                onCheckedChange={checked => set('include_in_net_worth', !!checked)}
              />
              <Label htmlFor="edit-include-nw" className="font-normal cursor-pointer">
                Include in net worth
              </Label>
            </div>

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {acc.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the account and all its balance history. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-red-700"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
