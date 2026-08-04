import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const conversationId = req.nextUrl.searchParams.get('conversation_id')

  if (conversationId) {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('user_id', user.id)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (error) return new Response(error.message, { status: 500 })
    return Response.json({ messages: data ?? [], conversationId })
  }

  // No conversation_id: load the most recent conversation
  const { data: latest } = await supabase
    .from('chat_messages')
    .select('conversation_id')
    .eq('user_id', user.id)
    .not('conversation_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!latest?.conversation_id) {
    return Response.json({ messages: [], conversationId: null })
  }

  const { data } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .eq('conversation_id', latest.conversation_id)
    .order('created_at', { ascending: true })

  return Response.json({ messages: data ?? [], conversationId: latest.conversation_id })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages, conversationId } = await req.json() as {
    messages: { role: string; content: string }[]
    conversationId: string
  }

  const rows = messages.map(m => ({
    user_id: user.id,
    role: m.role,
    content: m.content,
    conversation_id: conversationId,
  }))
  const { error } = await supabase.from('chat_messages').insert(rows)
  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const conversationId = req.nextUrl.searchParams.get('conversation_id')
  let query = supabase.from('chat_messages').delete().eq('user_id', user.id)
  if (conversationId) query = query.eq('conversation_id', conversationId)

  const { error } = await query
  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}
