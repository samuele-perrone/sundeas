'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { toMonthlyAmount, formatGBP } from '@/lib/finance'

type RecurringPayment = {
  id: string
  account_id: string
  name: string
  amount: number
  frequency: string
  type: string
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
}

export default function RecurringList({
  accountId,
  items,
}: {
  accountId: string
  items: RecurringPayment[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringPayment | null>(null)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState('monthly')
  const [type, setType] = useState<'income' | 'expense'>('income')

  const openAdd = () => {
    setEditing(null)
    setName('')
    setAmount('')
    setFrequency('monthly')
    setType('income')
    setOpen(true)
  }

  const openEdit = (item: RecurringPayment) => {
    setEditing(item)
    setName(item.name)
    setAmount(String(item.amount))
    setFrequency(item.frequency)
    setType(item.type as 'income' | 'expense')
    setOpen(true)
  }

  const save = async () => {
    if (!name || !amount) return
    setSaving(true)
    try {
      const body = { name, amount: parseFloat(amount), frequency, type, account_id: accountId }
      const url = editing ? `/api/recurring/${editing.id}` : '/api/recurring'
      const method = editing ? 'PATCH' : 'POST'
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setOpen(false)
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    await fetch(`/api/recurring/${id}`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1 mb-2">No recurring payments yet.</p>
      ) : (
        <ul className="space-y-0.5 mb-2" aria-label="Recurring payments">
          {items.map(item => {
            const monthly = toMonthlyAmount(item.amount, item.frequency)
            return (
              <li key={item.id} className="flex items-center gap-3 py-1.5 group">
                <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md uppercase tracking-wide ${
                  item.type === 'income'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-50 text-red-600'
                }`}>
                  {item.type}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {formatGBP(item.amount)} · {FREQ_LABELS[item.frequency] ?? item.frequency}
                    {item.frequency !== 'monthly' && (
                      <span className="opacity-60"> ({formatGBP(monthly)}/mo)</span>
                    )}
                  </span>
                </div>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    type="button"
                    onClick={() => openEdit(item)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={`Edit ${item.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <button
        type="button"
        onClick={openAdd}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
      >
        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        Add recurring payment
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit' : 'Add'} recurring payment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rec-name">Name</Label>
              <Input
                id="rec-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Salary, Netflix, Rent"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rec-type">Type</Label>
                <Select value={type} onValueChange={v => setType(v as 'income' | 'expense')}>
                  <SelectTrigger id="rec-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Income</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-freq">Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger id="rec-freq"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-amount">Amount (£)</Label>
              <Input
                id="rec-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name || !amount}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
