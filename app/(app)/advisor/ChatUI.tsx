'use client'
import { useState, useRef, useEffect } from 'react'
import { Send, AlertTriangle, SquarePen } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { useChatMessages } from '@/app/components/ChatContext'

const SUGGESTED = [
  'Am I on track for retirement at my target age?',
  'How should I allocate my monthly savings?',
  'Which accounts should I be prioritising right now?',
  'How can I optimise my ISA and pension contributions?',
  'What are the biggest risks to my financial plan?',
  'What actions should I take in the next 6 months?',
]

export default function ChatUI() {
  const { messages, setMessages, clearMessages, loaded, loadMessages, appendMessages } = useChatMessages()
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadMessages()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`
  }, [input])

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
          updated[updated.length - 1] = {
            role: 'assistant',
            content: updated[updated.length - 1].content + chunk,
          }
          return updated
        })
      }

      await appendMessages([userMsg, { role: 'assistant', content: assistantContent }])
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
        }
        return updated
      })
    } finally {
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  const handleClear = async () => {
    await clearMessages()
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border shrink-0">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight">Financial advisor</h1>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              disabled={streaming}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Start new conversation"
            >
              <SquarePen className="w-3.5 h-3.5" aria-hidden="true" />
              New conversation
            </button>
          )}
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
                        td: ({ children }) => (
                          <td className="px-3 py-2 border border-border">{children}</td>
                        ),
                        tr: ({ children }) => (
                          <tr className="even:bg-muted/20">{children}</tr>
                        ),
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
    </div>
  )
}
