'use client'
import { createContext, useContext, useState, useRef } from 'react'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ChatCtx {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
  clearMessages: () => Promise<void>
  loaded: boolean
  loadMessages: () => Promise<void>
  appendMessages: (msgs: ChatMessage[]) => Promise<void>
}

const ChatContext = createContext<ChatCtx>({
  messages: [],
  setMessages: () => {},
  clearMessages: async () => {},
  loaded: false,
  loadMessages: async () => {},
  appendMessages: async () => {},
})

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const loadingRef = useRef(false)

  const loadMessages = async () => {
    if (loaded || loadingRef.current) return
    loadingRef.current = true
    try {
      const res = await fetch('/api/chat/messages')
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } finally {
      setLoaded(true)
      loadingRef.current = false
    }
  }

  const appendMessages = async (msgs: ChatMessage[]) => {
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
      })
    } catch {}
  }

  const clearMessages = async () => {
    setMessages([])
    try {
      await fetch('/api/chat/messages', { method: 'DELETE' })
    } catch {}
  }

  return (
    <ChatContext.Provider value={{ messages, setMessages, clearMessages, loaded, loadMessages, appendMessages }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChatMessages() {
  return useContext(ChatContext)
}
