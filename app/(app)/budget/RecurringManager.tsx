'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Pencil, Trash2, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { toMonthlyAmount, formatGBP } from '@/lib/finance'

type RecurringPayment = {
  id: string
  account_id: string
  to_account_id: string | null
  name: string
  amount: number
  frequency: string
  type: string
  category: string | null
  payment_date: string | null
}

type Account = { id: string; name: string; institution_name: string | null }

const INCOME_CATS = [
  { value: 'salary', label: 'Salary' },
  { value: 'dividends', label: 'Dividends' },
  { value: 'rental', label: 'Rental' },
  { value: 'pension', label: 'Pension' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'benefits', label: 'Benefits' },
  { value: 'other', label: 'Other' },
]

const EXPENSE_CATS = [
  { value: 'rent', label: 'Rent' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'bills', label: 'Bills' },
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'direct_debit', label: 'Direct debit' },
  { value: 'transport', label: 'Transport' },
  { value: 'childcare', label: 'Childcare' },
  { value: 'other', label: 'Other' },
]

const EXPENSE_CAT_ORDER = ['rent', 'mortgage', 'bills', 'subscriptions', 'insurance', 'direct_debit', 'transport', 'childcare', 'other']

const CAT_LABEL: Record<string, string> = {
  salary: 'Salary', dividends: 'Dividends', rental: 'Rental', pension: 'Pension',
  freelance: 'Freelance', benefits: 'Benefits',
  rent: 'Rent', mortgage: 'Mortgage', bills: 'Bills', subscriptions: 'Subscriptions',
  insurance: 'Insurance', direct_debit: 'Direct debit', transport: 'Transport',
  childcare: 'Childcare', other: 'Other',
}

const FREQ_LABEL: Record<string, string> = { weekly: 'weekly', monthly: 'monthly', annual: 'annual', once: 'one-off' }

type ItemType = 'income' | 'expense' | 'transfer'

export default function RecurringManager({
  incomeItems,
  expenseItems,
  transferItems,
  oneOffItems,
  accounts,
}: {
  incomeItems: RecurringPayment[]
  expenseItems: RecurringPayment[]
  transferItems: RecurringPayment[]
  oneOffItems: RecurringPayment[]
  accounts: Account[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringPayment | null>(null)
  const [saving, setSaving] = useState(false)

  const [fType, setFType] = useState<ItemType>('income')
  const [fCategory, setFCategory] = useState('')
  const [fAccountId, setFAccountId] = useState('')
  const [fToAccountId, setFToAccountId] = useState('')
  const [fName, setFName] = useState('')
  const [fAmount, setFAmount] = useState('')
  const [fFreq, setFFreq] = useState('monthly')
  const [fPaymentDate, setFPaymentDate] = useState('')

  const openAdd = (type: ItemType, once = false) => {
    setEditing(null)
    setFType(type)
    setFCategory('')
    setFAccountId(accounts[0]?.id ?? '')
    setFToAccountId(accounts[1]?.id ?? accounts[0]?.id ?? '')
    setFName('')
    setFAmount('')
    setFFreq(once ? 'once' : 'monthly')
    setFPaymentDate('')
    setOpen(true)
  }

  const openEdit = (item: RecurringPayment) => {
    setEditing(item)
    setFType(item.type as ItemType)
    setFCategory(item.category ?? '')
    setFAccountId(item.account_id)
    setFToAccountId(item.to_account_id ?? '')
    setFName(item.name)
    setFAmount(String(item.amount))
    setFFreq(item.frequency)
    setFPaymentDate(item.payment_date ? item.payment_date.slice(0, 7) : '')
    setOpen(true)
  }

  const save = async () => {
    if (!fName || !fAmount || !fAccountId) return
    if (fType === 'transfer' && !fToAccountId) return
    setSaving(true)
    try {
      const body = {
        name: fName,
        amount: parseFloat(fAmount),
        frequency: fFreq,
        type: fType,
        category: fType === 'transfer' ? null : (fCategory || null),
        account_id: fAccountId,
        to_account_id: fType === 'transfer' ? fToAccountId : null,
        payment_date: fFreq === 'once' ? (fPaymentDate ? `${fPaymentDate}-01` : null) : null,
      }
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

  const accountLabel = (id: string) => {
    const a = accounts.find(acc => acc.id === id)
    if (!a) return ''
    return a.institution_name ? `${a.institution_name} · ${a.name}` : a.name
  }

  const renderItem = (item: RecurringPayment) => {
    const monthly = toMonthlyAmount(item.amount, item.frequency)
    const isTransfer = item.type === 'transfer'
    return (
      <li key={item.id} className="flex items-center gap-3 py-2.5 group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{item.name}</span>
            {!isTransfer && item.category && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground uppercase tracking-wide shrink-0">
                {CAT_LABEL[item.category] ?? item.category}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatGBP(item.amount)}
            {item.frequency === 'once'
              ? item.payment_date
                ? ` · ${new Date(`${item.payment_date}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`
                : ' · one-off'
              : ` · ${FREQ_LABEL[item.frequency] ?? item.frequency}${item.frequency !== 'monthly' ? ` (${formatGBP(monthly)}/mo)` : ''}`
            }
            {isTransfer && item.to_account_id ? (
              <span className="opacity-70">
                {' · '}{accountLabel(item.account_id)}
                <ArrowRight className="inline w-3 h-3 mx-1" aria-hidden="true" />
                {accountLabel(item.to_account_id)}
              </span>
            ) : (
              <span className="opacity-50"> · {accountLabel(item.account_id)}</span>
            )}
          </p>
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
  }

  // Group expenses by category
  const expByGroup: Record<string, RecurringPayment[]> = {}
  for (const item of expenseItems) {
    const cat = item.category ?? 'other'
    if (!expByGroup[cat]) expByGroup[cat] = []
    expByGroup[cat].push(item)
  }
  const groupOrder = [
    ...EXPENSE_CAT_ORDER.filter(c => expByGroup[c]),
    ...Object.keys(expByGroup).filter(c => !EXPENSE_CAT_ORDER.includes(c)),
  ]

  const cats = fType === 'income' ? INCOME_CATS : EXPENSE_CATS
  const canSave = !saving && !!fName && !!fAmount && !!fAccountId && (fType !== 'transfer' || !!fToAccountId) && (fFreq !== 'once' || !!fPaymentDate)

  return (
    <div className="space-y-6">
      {/* Money In */}
      <section aria-label="Money in">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Money in</h2>
          </div>
          <button type="button" onClick={() => openAdd('income')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />Add income
          </button>
        </div>
        {incomeItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No income sources yet — add your salary, dividends, or any regular income.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Income sources">{incomeItems.map(renderItem)}</ul>
        )}
      </section>

      <Separator />

      {/* Money Out */}
      <section aria-label="Money out">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-destructive" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Money out</h2>
          </div>
          <button type="button" onClick={() => openAdd('expense')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />Add expense
          </button>
        </div>
        {expenseItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No recurring expenses yet — add rent, mortgage, subscriptions, bills, etc.</p>
        ) : (
          <div className="space-y-5">
            {groupOrder.map(cat => {
              const items = expByGroup[cat]
              if (!items?.length) return null
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-0.5">{CAT_LABEL[cat] ?? cat}</p>
                  <ul className="divide-y divide-border" aria-label={CAT_LABEL[cat] ?? cat}>{items.map(renderItem)}</ul>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Separator />

      {/* One-off payments */}
      <section aria-label="One-off payments">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">📅</span>
            <h2 className="text-sm font-semibold">One-off payments</h2>
            <span className="text-xs text-muted-foreground">(not included in monthly totals)</span>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => openAdd('income', true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-emerald-600 transition-colors">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />Money in
            </button>
            <button type="button" onClick={() => openAdd('expense', true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />Money out
            </button>
          </div>
        </div>
        {oneOffItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No one-off payments yet — add a big expense or unexpected income for a specific date.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="One-off payments">
            {oneOffItems
              .sort((a, b) => (a.payment_date ?? '').localeCompare(b.payment_date ?? ''))
              .map(renderItem)}
          </ul>
        )}
      </section>

      <Separator />

      {/* Transfers */}
      <section aria-label="Transfers">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Transfers</h2>
            <span className="text-xs text-muted-foreground">(between accounts — not counted in net)</span>
          </div>
          <button type="button" onClick={() => openAdd('transfer')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors">
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />Add transfer
          </button>
        </div>
        {transferItems.length === 0 ? (
          <p className="text-sm text-muted-foreground py-1">No recurring transfers yet — add standing orders between your accounts.</p>
        ) : (
          <ul className="divide-y divide-border" aria-label="Recurring transfers">{transferItems.map(renderItem)}</ul>
        )}
      </section>

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Edit' : 'Add'}{' '}
              {fFreq === 'once'
                ? (fType === 'income' ? 'one-off income' : 'one-off expense')
                : fType === 'income' ? 'income source' : fType === 'expense' ? 'recurring expense' : 'recurring transfer'}
            </DialogTitle>
          </DialogHeader>

          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">Add accounts first before adding recurring payments.</p>
          ) : (
            <div className="space-y-4">
              {/* Type + Category (or Type alone for transfer) */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-type">Type</Label>
                  <Select value={fType} onValueChange={v => { setFType(v as ItemType); setFCategory('') }}>
                    <SelectTrigger id="rec-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="expense">Expense</SelectItem>
                      <SelectItem value="transfer">Transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {fType !== 'transfer' && (
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-cat">Category</Label>
                    <Select value={fCategory} onValueChange={setFCategory}>
                      <SelectTrigger id="rec-cat"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent>
                        {cats.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* Account(s) */}
              {fType === 'transfer' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-from">From account</Label>
                    <Select value={fAccountId} onValueChange={setFAccountId}>
                      <SelectTrigger id="rec-from">
                        <SelectValue placeholder="Select…">
                          {fAccountId ? accountLabel(fAccountId) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.institution_name ? `${a.institution_name} · ${a.name}` : a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="rec-to">To account</Label>
                    <Select value={fToAccountId} onValueChange={setFToAccountId}>
                      <SelectTrigger id="rec-to">
                        <SelectValue placeholder="Select…">
                          {fToAccountId ? accountLabel(fToAccountId) : null}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.filter(a => a.id !== fAccountId).map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.institution_name ? `${a.institution_name} · ${a.name}` : a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="rec-account">Account</Label>
                  <Select value={fAccountId} onValueChange={setFAccountId}>
                    <SelectTrigger id="rec-account">
                      <SelectValue placeholder="Select account…">
                        {fAccountId ? accountLabel(fAccountId) : null}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map(a => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.institution_name ? `${a.institution_name} · ${a.name}` : a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="rec-name">Name</Label>
                <Input
                  id="rec-name"
                  value={fName}
                  onChange={e => setFName(e.target.value)}
                  placeholder={fType === 'transfer' ? 'e.g. Monthly savings transfer' : 'e.g. Salary, Netflix, Council tax'}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-amount">Amount (£)</Label>
                  <Input
                    id="rec-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={fAmount}
                    onChange={e => setFAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-freq">Frequency</Label>
                  <Select value={fFreq} onValueChange={setFFreq}>
                    <SelectTrigger id="rec-freq"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="annual">Annual</SelectItem>
                      {fType !== 'transfer' && <SelectItem value="once">One-off</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {fFreq === 'once' && (
                <div className="space-y-1.5">
                  <Label htmlFor="rec-date">Month</Label>
                  <Input
                    id="rec-date"
                    type="month"
                    required
                    value={fPaymentDate}
                    onChange={e => setFPaymentDate(e.target.value)}
                    className="w-48"
                  />
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {accounts.length > 0 && (
              <Button onClick={save} disabled={!canSave}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
