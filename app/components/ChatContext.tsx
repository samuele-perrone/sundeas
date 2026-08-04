'use client'
import { createContext, useContext, useState, useRef } from 'react'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ChatCtx {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  conversationId: string | null
  loaded: boolean
  loadCurrentConversation: () => Promise<void>
  switchConversation: (id: string) => Promise<void>
  startNewConversation: () => void
  appendMessages: (msgs: ChatMessage[]) => Promise<void>
}

const ChatContext = createContext<ChatCtx>({
  messages: [],
  setMessages: () => {},
  conversationId: null,
  loaded: false,
  loadCurrentConversation: async () => {},
  switchConversation: async () => {},
  startNewConversation: () => {},
  appendMessages: async () => {},
})

const SESSION_KEY = 'advisor_conv_id'

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const loadingRef = useRef(false)

  const loadCurrentConversation = async () => {
    if (loaded || loadingRef.current) return
    loadingRef.current = true
    try {
      const sessionConvId = typeof window !== 'undefined' ? sessionStorage.getItem(SESSION_KEY) : null
      const url = sessionConvId
        ? `/api/chat/messages?conversation_id=${sessionConvId}`
        : '/api/chat/messages'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const id: string = data.conversationId ?? crypto.randomUUID()
        setConversationId(id)
        setMessages(data.messages ?? [])
        if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, id)
      }
    } finally {
      setLoaded(true)
      loadingRef.current = false
    }
  }

  const switchConversation = async (id: string) => {
    setLoaded(false)
    setMessages([])
    try {
      const res = await fetch(`/api/chat/messages?conversation_id=${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages ?? [])
        setConversationId(id)
        if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, id)
      }
    } finally {
      setLoaded(true)
    }
  }

  const startNewConversation = () => {
    const id = crypto.randomUUID()
    setConversationId(id)
    setMessages([])
    if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_KEY, id)
  }

  const appendMessages = async (msgs: ChatMessage[]) => {
    if (!conversationId) return
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs, conversationId }),
      })
    } catch {}
  }

  return (
    <ChatContext.Provider value={{
      messages, setMessages,
      conversationId, loaded,
      loadCurrentConversation, switchConversation, startNewConversation,
      appendMessages,
    }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatMessages() {
  return useContext(ChatContext)
}
