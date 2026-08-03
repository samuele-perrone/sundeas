import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold text-[#0f1117] mb-2">Dashboard</h1>
      <p className="text-sm text-[#6b7280]">Welcome, {user.email}. More coming soon.</p>
    </main>
  )
}
