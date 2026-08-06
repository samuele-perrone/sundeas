'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, AlertTriangle, SquarePen, History, ExternalLink, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useChatMessages } from '@/app/components/ChatContext'

type MseTip = { title: string; link: string; description: string; pubDate: string }

function MsePanel({ onClose }: { onClose: () => void }) {
  const [tips, setTips] = useState<MseTip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/mse-tips')
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setTips(data.items ?? [])
      })
      .catch(() => setError('Could not load MSE tips.'))
      .finally(() => setLoading(false))
  }, [])

  function fmtDate(dateStr: string) {
    try { return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) }
    catch { return '' }
  }

  return (
    <div className="flex flex-col h-full border-l border-border bg-white w-80 shrink-0">
      {/* Panel header */}
      <div className="px-4 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#e8232a]">MoneySaving</span>
            <span className="text-sm font-bold text-foreground">Expert</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close MSE panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Latest articles from MSE — a second opinion alongside your AI advisor.</p>
      </div>

      {/* Articles */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center gap-1.5 px-4 py-5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
          </div>
        ) : error ? (
          <p className="px-4 py-5 text-xs text-muted-foreground">{error}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {tips.map((tip, i) => (
              <li key={i}>
                <a
                  href={tip.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-3.5 hover:bg-accent/30 transition-colors group"
                >
                  <p className="text-xs font-semibold text-foreground leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {tip.title}
                  </p>
                  {tip.description && (
                    <p className="text-[11px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                      {tip.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {tip.pubDate && (
                      <span className="text-[10px] text-muted-foreground">{fmtDate(tip.pubDate)}</span>
                    )}
                    <span className="flex items-center gap-0.5 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity ml-auto">
                      Read on MSE <ExternalLink className="w-2.5 h-2.5" />
                    </span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* MSE deal quick links */}
      <div className="px-4 py-3 border-t border-border shrink-0">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Best deals on MSE</p>
        <ul className="space-y-1.5">
          {MSE_DEALS.map(d => (
            <li key={d.href}>
              <a
                href={d.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between text-xs text-foreground hover:text-primary transition-colors group"
              >
                <span>{d.label}</span>
                <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

const SUGGESTED = [
  'Am I on track for retirement at my target age?',
  'How should I allocate my monthly savings?',
  'Which accounts should I be prioritising right now?',
  'How can I optimise my ISA and pension contributions?',
  'What are the biggest risks to my financial plan?',
  'What actions should I take in the next 6 months?',
]

const DEAL_CHECK_PROMPT = `Review my accounts and recurring payments and tell me:
1. Which of my savings or ISA accounts have an interest rate that looks low compared to current market rates (typically 4–5% for easy-access savings, 4–5% for cash ISAs)?
2. Are there any subscriptions or recurring expenses where I might be overpaying or could switch to a better deal?
3. Would I benefit from switching my current account to one with better perks or cashback?

Be specific — name the exact accounts and amounts. I want concrete switching recommendations, not generic advice.`

const MSE_DEALS = [
  { label: 'Best savings accounts', href: 'https://www.moneysavingexpert.com/savings/savings-accounts-best-interest/' },
  { label: 'Best cash ISAs', href: 'https://www.moneysavingexpert.com/savings/cash-isa/' },
  { label: 'Best bank accounts', href: 'https://www.moneysavingexpert.com/banking/compare-best-bank-accounts/' },
  { label: 'Cheap broadband deals', href: 'https://www.moneysavingexpert.com/broadband/' },
  { label: 'Cheap mobile SIMs', href: 'https://www.moneysavingexpert.com/phones/sim-only-contracts/' },
  { label: 'Best stocks & shares ISAs', href: 'https://www.moneysavingexpert.com/investments/stocks-shares-isas/' },
]

type ConversationSummary = {
  id: string
  startedAt: string
  lastAt: string
  firstUserMessage: string
  messageCount: number
}

function relativeDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

export default function ChatUI() {
  const {
    messages, setMessages,
    conversationId, loaded,
    loadCurrentConversation, switchConversation, startNewConversation,
    appendMessages,
  } = useChatMessages()

  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showMse, setShowMse] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const historyRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadCurrentConversation() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return
    const handler = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showHistory])

  const openHistory = async () => {
    setShowHistory(prev => !prev)
    if (conversations.length > 0) return
    setLoadingHistory(true)
    try {
      const res = await fetch('/api/chat/conversations')
      if (res.ok) setConversations(await res.json())
    } finally {
      setLoadingHistory(false)
    }
  }

  const handleSwitchConversation = async (id: string) => {
    setShowHistory(false)
    await switchConversation(id)
  }

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    const userMsg = { role: 'user' as const, content: trimmed }
    const outgoing = [...messages, userMsg]
    setMessages([...outgoing, { role: 'assistant' as const, content: '' }])
    setInput('')
    setStreaming(true)

    let assistantContent = ''

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: outgoing }),
      })
      if (!res.ok || !res.body) throw new Error(await res.text())

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        assistantContent += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: updated[updated.length - 1].content + chunk }
          return updated
        })
      }

      await appendMessages([userMsg, { role: 'assistant', content: assistantContent }])
      // Refresh conversation list so history stays fresh
      setConversations([])
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }
        return updated
      })
    } finally {
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) }
  }

  return (
    <div className="flex h-screen">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Financial advisor</h1>
          <div className="flex items-center gap-3" ref={historyRef}>
            {/* History dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={openHistory}
                disabled={streaming}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                aria-label="View conversation history"
              >
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                History
              </button>
              {showHistory && (
                <div className="absolute right-0 top-7 z-50 w-72 rounded-xl border border-border bg-white shadow-lg overflow-hidden">
                  <p className="px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border">
                    Past conversations
                  </p>
                  {loadingHistory ? (
                    <div className="flex items-center gap-1.5 px-3 py-3">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                    </div>
                  ) : conversations.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-muted-foreground">No past conversations.</p>
                  ) : (
                    <ul className="max-h-72 overflow-y-auto">
                      {conversations.map(conv => (
                        <li key={conv.id}>
                          <button
                            type="button"
                            onClick={() => handleSwitchConversation(conv.id)}
                            className={`w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/50 last:border-0 ${conversationId === conv.id ? 'bg-accent/30' : ''}`}
                          >
                            <p className="text-xs font-medium text-foreground truncate leading-snug">
                              {conv.firstUserMessage || '(empty)'}
                            </p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {relativeDate(conv.lastAt)} · {conv.messageCount} messages
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={startNewConversation}
              disabled={streaming}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Start new conversation"
            >
              <SquarePen className="w-3.5 h-3.5" aria-hidden="true" />
              New
            </button>

            <button
              type="button"
              onClick={() => setShowMse(prev => !prev)}
              className={`flex items-center gap-1.5 text-xs font-medium transition-colors px-2.5 py-1 rounded-full border ${
                showMse
                  ? 'bg-[#e8232a] text-white border-[#e8232a]'
                  : 'text-[#e8232a] border-[#e8232a]/40 hover:border-[#e8232a] hover:bg-[#e8232a]/5'
              }`}
              aria-label="Toggle MSE recommendations"
            >
              MSE tips
            </button>
          </div>
        </div>
        <div className="flex items-start gap-1.5 mt-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-px" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            AI-powered insights based on your real account data.{' '}
            <span className="text-amber-600 font-medium">Educational only — not regulated financial advice.</span>
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!loaded ? (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
          </div>
        ) : messages.length === 0 ? (
          <div className="max-w-2xl space-y-5">
            <p className="text-sm text-muted-foreground">
              Ask me anything about your finances. I have full context of your accounts, net worth, budget, and retirement goal — so I can give you specific, numbers-based guidance.
            </p>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Deal check</p>
              <button
                type="button"
                onClick={() => send(DEAL_CHECK_PROMPT)}
                className="text-sm px-3.5 py-2 rounded-xl border border-[#e8232a]/30 bg-[#e8232a]/5 hover:border-[#e8232a] hover:bg-[#e8232a]/10 transition-colors text-[#e8232a] text-left w-full"
              >
                Am I getting the best rates? Check my savings, ISA, and subscriptions for better deals
              </button>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Suggested questions</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-sm px-3.5 py-2 rounded-xl border border-border bg-white hover:border-primary hover:text-primary hover:bg-accent/40 transition-colors text-muted-foreground text-left"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl space-y-5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && !msg.content ? (
                  <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-card border border-border">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                  </div>
                ) : msg.role === 'user' ? (
                  <div className="max-w-full rounded-2xl px-4 py-3 text-sm leading-relaxed bg-primary text-primary-foreground">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-card border border-border text-foreground prose-sm max-w-full">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        table: ({ children }) => (
                          <div className="overflow-x-auto my-3">
                            <table className="w-full text-sm border-collapse">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                        th: ({ children }) => (
                          <th className="px-3 py-2 text-left font-semibold border border-border text-xs uppercase tracking-wide text-muted-foreground">
                            {children}
                          </th>
                        ),
                        td: ({ children }) => <td className="px-3 py-2 border border-border">{children}</td>,
                        tr: ({ children }) => <tr className="even:bg-muted/20">{children}</tr>,
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                        li: ({ children }) => <li>{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        em: ({ children }) => <em className="italic">{children}</em>,
                        h2: ({ children }) => <h2 className="font-semibold text-base mt-3 mb-1 first:mt-0">{children}</h2>,
                        h3: ({ children }) => <h3 className="font-medium mt-2 mb-1 first:mt-0">{children}</h3>,
                        code: ({ children }) => (
                          <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 text-muted-foreground my-2">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="border-border my-3" />,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-8 py-4 border-t border-border shrink-0 bg-background">
        <div className="max-w-2xl flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances… (Enter to send, Shift+Enter for new line)"
            rows={1}
            disabled={streaming || !loaded}
            className="flex-1 resize-none rounded-xl border border-input bg-white px-4 py-2.5 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-colors overflow-y-auto disabled:opacity-60"
            style={{ minHeight: '44px', maxHeight: '160px' }}
            aria-label="Message"
          />
          <Button
            onClick={() => send(input)}
            disabled={streaming || !input.trim() || !loaded}
            className="gap-2 shrink-0"
          >
            <Send className="w-3.5 h-3.5" aria-hidden="true" />
            Send
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
          Powered by Claude · Context includes your live account balances, budget, and retirement goal
        </p>
      </div>
      </div>{/* end chat column */}

      {/* MSE panel */}
      {showMse && <MsePanel onClose={() => setShowMse(false)} />}
    </div>
  )
}
