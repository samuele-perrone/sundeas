'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Sparkles, MessageSquare, Send, CheckCircle2 } from 'lucide-react'

type Recommendation = {
  title: string
  detail: string
  priority: 'high' | 'medium' | 'low'
}

type RecommendationsData = {
  summary: string
  recommendations: Recommendation[]
}

const PRIORITY_VARIANT: Record<string, 'destructive' | 'secondary' | 'outline'> = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
}

const PRIORITY_BAR: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-emerald-500',
}

function ReplyBox({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) textareaRef.current?.focus()
  }, [open])

  async function send() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      const conversationId = crypto.randomUUID()
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          messages: [
            { role: 'assistant', content: `Recommendation — ${rec.title}: ${rec.detail}` },
            { role: 'user', content: text.trim() },
          ],
        }),
      })
      setSent(true)
      setText('')
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
        Saved to advisor — your next chat will have this context.
      </div>
    )
  }

  return (
    <div className="mt-2">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          Reply
        </button>
      ) : (
        <div className="space-y-1.5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            placeholder="Ask a follow-up or share your thoughts…"
            rows={2}
            className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <div className="flex items-center gap-2">
            <Button size="sm" className="h-6 px-2 text-xs" onClick={send} disabled={!text.trim() || sending}>
              <Send className="w-3 h-3 mr-1" />
              {sending ? 'Sending…' : 'Send'}
            </Button>
            <button
              onClick={() => { setOpen(false); setText('') }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <span className="text-[10px] text-muted-foreground ml-auto">⌘↵ to send</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RecommendationsWidget() {
  const [data, setData] = useState<RecommendationsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch('/api/recommendations')
      if (!res.ok) throw new Error()
      const json = await res.json()
      if (!json.recommendations?.length) throw new Error()
      setData(json)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            AI recommendations
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={load}
            disabled={loading}
            aria-label="Refresh recommendations"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && !data ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-3 bg-muted rounded w-full" />
            <div className="h-3 bg-muted rounded w-4/5" />
            <div className="h-px bg-border my-3" />
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-3 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-full" />
                <div className="h-3 bg-muted rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-sm text-muted-foreground py-2">
            Could not load recommendations.{' '}
            <button onClick={load} className="text-primary underline underline-offset-4">Try again</button>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {data.summary && (
              <p className="text-sm text-muted-foreground leading-relaxed">{data.summary}</p>
            )}
            <ul className="space-y-4" aria-label="AI investment recommendations">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex gap-3">
                  <div className={`w-0.5 shrink-0 rounded-full mt-1 self-stretch ${PRIORITY_BAR[rec.priority] ?? 'bg-muted'}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-sm font-semibold leading-snug">{rec.title}</p>
                      <Badge
                        variant={PRIORITY_VARIANT[rec.priority] ?? 'secondary'}
                        className="text-[10px] uppercase shrink-0"
                        aria-label={`Priority: ${rec.priority}`}
                      >
                        {rec.priority}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{rec.detail}</p>
                    <ReplyBox rec={rec} />
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-[10px] text-muted-foreground border-t border-border pt-3 leading-relaxed">
              AI-generated — educational only, not regulated financial advice. Replies are saved to your advisor chat history.
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
