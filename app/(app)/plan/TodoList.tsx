'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, Circle, Plus, ChevronDown } from 'lucide-react'

type Todo = {
  id: string
  title: string
  description: string | null
  priority: string
  due_date: string | null
  completed_at: string | null
  source: string
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

export default function TodoList({ userId, todos }: { userId: string; todos: Todo[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  const open = todos.filter(t => !t.completed_at)
  const done = todos.filter(t => t.completed_at)

  const addTodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('todos').insert({ user_id: userId, title: title.trim(), priority, source: 'manual' })
    setTitle('')
    setPriority('medium')
    setAdding(false)
    setSaving(false)
    router.refresh()
  }

  const complete = async (id: string) => {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('todos').update({ completed_at: new Date().toISOString() }).eq('id', id)
    setCompleting(null)
    router.refresh()
  }

  const reopen = async (id: string) => {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('todos').update({ completed_at: null }).eq('id', id)
    setCompleting(null)
    router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Open items */}
      {open.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">No open action items.</p>
      ) : (
        <ul className="space-y-1" aria-label="Open action items">
          {open.map((todo, i) => (
            <li key={todo.id}>
              <div className="flex items-start gap-3 py-2.5">
                <button
                  onClick={() => complete(todo.id)}
                  disabled={completing === todo.id}
                  aria-label={`Mark "${todo.title}" as complete`}
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full transition-colors disabled:opacity-50"
                >
                  <Circle className="w-5 h-5" aria-hidden="true" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{todo.title}</span>
                    <Badge
                      variant={PRIORITY_VARIANT[todo.priority] ?? 'secondary'}
                      className="text-[10px] uppercase"
                      aria-label={`Priority: ${todo.priority}`}
                    >
                      {todo.priority}
                    </Badge>
                    {todo.source === 'ai' && (
                      <Badge variant="outline" className="text-[10px] text-primary border-primary/30">
                        AI
                      </Badge>
                    )}
                  </div>
                  {todo.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{todo.description}</p>
                  )}
                </div>
              </div>
              {i < open.length - 1 && <Separator />}
            </li>
          ))}
        </ul>
      )}

      {/* Add item */}
      {adding ? (
        <form onSubmit={addTodo} className="space-y-3 pt-2" aria-label="Add action item">
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="todo-title" className="sr-only">Action item title</Label>
              <Input
                id="todo-title"
                autoFocus
                required
                placeholder="Action item…"
                value={title}
                onChange={e => setTitle(e.target.value)}
              />
            </div>
            <Select value={priority} onValueChange={v => v && setPriority(v)}>
              <SelectTrigger className="w-32" aria-label="Priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Adding…' : 'Add'}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAdding(true)}
          className="gap-1.5"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          Add action item
        </Button>
      )}

      {/* Completed */}
      {done.length > 0 && (
        <details className="mt-2 group">
          <summary className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded transition-colors">
            <ChevronDown className="w-3.5 h-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
            {done.length} completed
          </summary>
          <ul className="space-y-2 mt-3" aria-label="Completed action items">
            {done.map(todo => (
              <li key={todo.id} className="flex items-center gap-3">
                <button
                  onClick={() => reopen(todo.id)}
                  disabled={completing === todo.id}
                  aria-label={`Reopen "${todo.title}"`}
                  className="shrink-0 text-emerald-500 hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-full transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                </button>
                <span className="text-sm text-muted-foreground line-through">{todo.title}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
