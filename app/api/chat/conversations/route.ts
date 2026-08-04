import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data } = await supabase
    .from('chat_messages')
    .select('conversation_id, role, content, created_at')
    .eq('user_id', user.id)
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: true })

  if (!data) return Response.json([])

  type ConvEntry = { id: string; startedAt: string; lastAt: string; firstUserMessage: string; messageCount: number }
  const convMap = new Map<string, ConvEntry>()

  for (const msg of data) {
    const id = String(msg.conversation_id)
    if (!convMap.has(id)) {
      convMap.set(id, { id, startedAt: msg.created_at, lastAt: msg.created_at, firstUserMessage: '', messageCount: 0 })
    }
    const conv = convMap.get(id)!
    conv.lastAt = msg.created_at
    conv.messageCount++
    if (!conv.firstUserMessage && msg.role === 'user') {
      conv.firstUserMessage = msg.content
    }
  }

  const conversations = [...convMap.values()]
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, 30)

  return Response.json(conversations)
}
