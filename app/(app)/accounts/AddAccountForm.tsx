'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
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

export default function AddAccountForm({ userId }: { userId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    institution_name: '',
    name: '',
    type: 'current',
    balance: '',
    interest_rate: '',
    notes: '',
    include_in_net_worth: true,
  })

  const set = (field: string, value: string | boolean | null) =>
    setForm(f => ({ ...f, [field]: value ?? '' }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const balance = parseFloat(form.balance)
    if (isNaN(balance)) {
      setError('Enter a valid balance.')
      setLoading(false)
      return
    }

    const interest_rate = form.interest_rate !== '' ? parseFloat(form.interest_rate) : null
    if (form.interest_rate !== '' && (interest_rate === null || isNaN(interest_rate!))) {
      setError('Enter a valid interest rate or leave blank.')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error: err } = await supabase.from('accounts').insert({
      user_id: userId,
      institution_name: form.institution_name.trim() || null,
      name: form.name.trim(),
      type: form.type,
      balance,
      interest_rate: interest_rate ?? null,
      rate_source: interest_rate !== null ? 'manual' : null,
      currency: 'GBP',
      notes: form.notes.trim() || null,
      include_in_net_worth: form.include_in_net_worth,
      is_manual: true,
    })

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setForm({ institution_name: '', name: '', type: 'current', balance: '', interest_rate: '', notes: '', include_in_net_worth: true })
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="acc-institution">Institution</Label>
        <Input
          id="acc-institution"
          placeholder="e.g. Vanguard, Hargreaves Lansdown, Monzo"
          value={form.institution_name}
          onChange={e => set('institution_name', e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="acc-name">Account name</Label>
          <Input
            id="acc-name"
            required
            placeholder="e.g. SIPP, Cash ISA, Current"
            value={form.name}
            onChange={e => set('name', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-type">Type</Label>
          <Select value={form.type} onValueChange={v => set('type', v)}>
            <SelectTrigger id="acc-type" className="w-full" aria-label="Account type">
              <SelectValue placeholder="Select type">
                {ACCOUNT_TYPES.find(t => t.value === form.type)?.label ?? 'Select type'}
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
          <Label htmlFor="acc-balance">Balance (£)</Label>
          <Input
            id="acc-balance"
            required
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.balance}
            onChange={e => set('balance', e.target.value)}
            aria-label="Balance in pounds"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="acc-rate">
            Interest rate (%)
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">optional</span>
          </Label>
          <Input
            id="acc-rate"
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
        <Label htmlFor="acc-notes">Notes (optional)</Label>
        <Textarea
          id="acc-notes"
          rows={3}
          placeholder="e.g. Fixed rate until Dec, or paste a URL for rate sync"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      <div className="flex items-center gap-2">
        <Checkbox
          id="include-nw"
          checked={form.include_in_net_worth}
          onCheckedChange={checked => set('include_in_net_worth', !!checked)}
          aria-describedby="include-nw-desc"
        />
        <Label htmlFor="include-nw" className="font-normal cursor-pointer">
          Include in net worth
        </Label>
        <span id="include-nw-desc" className="sr-only">
          When checked, this account's balance is counted in your total net worth.
        </span>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Adding…' : 'Add account'}
      </Button>
    </form>
  )
}
