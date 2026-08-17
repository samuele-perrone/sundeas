'use client'
import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Plus } from 'lucide-react'

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

const BLANK = { institution_name: '', name: '', type: 'current', balance: '', interest_rate: '', notes: '', include_in_net_worth: true }

export default function AddAccountForm({ userId }: { userId: string }) {
  const router = useRouter()
  const firstRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState(BLANK)

  const set = (field: string, value: string | boolean) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const balance = parseFloat(form.balance)
    if (isNaN(balance)) { setError('Enter a valid balance.'); return }
    const interest_rate = form.interest_rate !== '' ? parseFloat(form.interest_rate) : null
    setLoading(true)
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
    setLoading(false)
    if (err) { setError(err.message); return }
    setForm(BLANK)
    router.refresh()
    firstRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {/* Row 1: Institution · Name · Type */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Input
          ref={firstRef}
          placeholder="Institution (optional)"
          value={form.institution_name}
          onChange={e => set('institution_name', e.target.value)}
          className="text-sm"
        />
        <Input
          required
          placeholder="Account name"
          value={form.name}
          onChange={e => set('name', e.target.value)}
          className="text-sm"
        />
        <Select value={form.type} onValueChange={v => set('type', v)}>
          <SelectTrigger className="w-full text-sm" aria-label="Account type">
            <SelectValue>{ACCOUNT_TYPES.find(t => t.value === form.type)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ACCOUNT_TYPES.map(t => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Row 2: Balance · Rate · Add */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
          <Input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.balance}
            onChange={e => set('balance', e.target.value)}
            className="pl-6 text-sm"
            aria-label="Balance in pounds"
          />
        </div>
        <div className="relative">
          <Input
            type="number"
            step="0.01"
            min="0"
            max="100"
            placeholder="Rate (optional)"
            value={form.interest_rate}
            onChange={e => set('interest_rate', e.target.value)}
            className="pr-8 text-sm"
            aria-label="Interest rate percent"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
        </div>
        <Button type="submit" disabled={loading} size="sm" className="gap-1.5">
          <Plus className="w-3.5 h-3.5" />
          {loading ? 'Adding…' : 'Add'}
        </Button>
      </div>

      {/* Row 3: Notes */}
      <Textarea
        placeholder="Notes (optional) — e.g. fixed rate until Dec"
        rows={2}
        value={form.notes}
        onChange={e => set('notes', e.target.value)}
        className="text-sm resize-none"
      />

      <div className="flex items-center gap-2 pt-0.5">
        <Checkbox
          id="add-include-nw"
          checked={form.include_in_net_worth}
          onCheckedChange={checked => set('include_in_net_worth', !!checked)}
        />
        <Label htmlFor="add-include-nw" className="text-sm font-normal cursor-pointer">Include in net worth</Label>
      </div>

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </form>
  )
}
