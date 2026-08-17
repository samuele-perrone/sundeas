'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sparkles } from 'lucide-react'

type Goal = {
  id: string
  target_retirement_age: number
  target_monthly_income: number | null
  target_lump_sum: number | null
  notes: string | null
}

type Profile = {
  date_of_birth: string | null
  target_retirement_age: number | null
}

export default function GoalForm({
  userId,
  existingGoal,
  profile,
}: {
  userId: string
  existingGoal: Goal | null
  profile: Profile | null
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [reasoning, setReasoning] = useState<string | null>(null)

  const [form, setForm] = useState({
    target_retirement_age: String(existingGoal?.target_retirement_age ?? profile?.target_retirement_age ?? 57),
    target_monthly_income: String(existingGoal?.target_monthly_income ?? ''),
    notes: existingGoal?.notes ?? '',
    dob: profile?.date_of_birth ?? '',
  })

  const monthlyIncome = parseFloat(form.target_monthly_income) || 0
  const derivedLumpSum = monthlyIncome > 0 ? Math.round((monthlyIncome * 12) / 0.04) : null

  const set = (field: string, value: string) => {
    setSaved(false)
    setForm(f => ({ ...f, [field]: value }))
  }

  const handleSuggest = async () => {
    setSuggesting(true)
    setError(null)
    setReasoning(null)
    try {
      const res = await fetch('/api/goals/suggest', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to get suggestion')
      setForm(f => ({
        ...f,
        target_monthly_income: String(data.target_monthly_income ?? ''),
      }))
      if (data.reasoning) setReasoning(data.reasoning)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not calculate targets')
    } finally {
      setSuggesting(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()

    if (form.dob) {
      await supabase.from('profiles').update({ date_of_birth: form.dob }).eq('id', userId)
    }

    const payload = {
      user_id: userId,
      target_retirement_age: parseInt(form.target_retirement_age, 10),
      target_monthly_income: monthlyIncome || null,
      target_lump_sum: derivedLumpSum,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    }

    let err
    if (existingGoal) {
      ;({ error: err } = await supabase.from('goals').update(payload).eq('id', existingGoal.id))
    } else {
      ;({ error: err } = await supabase.from('goals').insert(payload))
    }

    if (err) {
      setError(err.message)
      setLoading(false)
      return
    }

    setSaved(true)
    setLoading(false)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" aria-label="Retirement goal form">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="goal-dob">Date of birth</Label>
          <Input
            id="goal-dob"
            type="date"
            value={form.dob}
            onChange={e => set('dob', e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-age">Target retirement age</Label>
          <Input
            id="goal-age"
            type="number"
            required
            min={40}
            max={80}
            value={form.target_retirement_age}
            onChange={e => set('target_retirement_age', e.target.value)}
          />
        </div>
      </div>

      {/* AI targets section */}
      <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Retirement targets</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Not sure? Let AI calculate based on your current situation.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSuggest}
            disabled={suggesting}
            className="gap-2 shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            {suggesting ? 'Calculating…' : 'Calculate with AI'}
          </Button>
        </div>

        {reasoning && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2.5">
            <p className="text-xs text-indigo-700 leading-relaxed">{reasoning}</p>
            <p className="text-[10px] text-indigo-400 mt-1">Educational estimate only — not regulated financial advice.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="goal-monthly">Monthly income target (£)</Label>
            <Input
              id="goal-monthly"
              type="number"
              step="100"
              placeholder="e.g. 3000"
              value={form.target_monthly_income}
              onChange={e => set('target_monthly_income', e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Required pot (4% rule)</p>
            <p className="h-10 flex items-center px-3 rounded-lg border border-input bg-secondary/40 text-sm font-semibold tabular-nums">
              {derivedLumpSum ? `£${derivedLumpSum.toLocaleString('en-GB')}` : '—'}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="goal-notes">Notes (optional)</Label>
        <Textarea
          id="goal-notes"
          rows={2}
          placeholder="e.g. assuming state pension from 67, want to travel in early retirement"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          className="resize-none"
        />
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {saved && <p role="status" className="text-sm text-emerald-600">Goal saved.</p>}

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving…' : existingGoal ? 'Update goal' : 'Save goal'}
      </Button>
    </form>
  )
}
