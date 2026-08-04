'use client'
import { createContext, useContext, useState } from 'react'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

interface ChatCtx {
  messages: ChatMessage[]
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

const ChatContext = createContext<ChatCtx>({ messages: [], setMessages: () => {} })

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  return <ChatContext.Provider value={{ messages, setMessages }}>{children}</ChatContext.Provider>
}

export function useChatMessages() {
  return useContext(ChatContext)
}
