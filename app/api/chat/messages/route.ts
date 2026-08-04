import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return new Response(error.message, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { messages } = await req.json() as { messages: { role: string; content: string }[] }

  const rows = messages.map(m => ({ user_id: user.id, role: m.role, content: m.content }))
  const { error } = await supabase.from('chat_messages').insert(rows)
  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}

export async function DELETE() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { error } = await supabase.from('chat_messages').delete().eq('user_id', user.id)
  if (error) return new Response(error.message, { status: 500 })

  return new Response(null, { status: 204 })
}
