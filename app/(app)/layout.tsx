import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignOutButton from '@/app/components/SignOutButton'
import AppNav from '@/app/components/AppNav'
import RetirementWidget from '@/app/components/RetirementWidget'
import { Providers } from '@/app/components/Providers'
import type { Metadata } from 'next'

export async function generateMetadata(): Promise<Metadata> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { title: 'Sundeas' }
  const { data: goal } = await supabase
    .from('goals')
    .select('target_retirement_age')
    .eq('user_id', user.id)
    .single()
  const age = goal?.target_retirement_age
  return { title: age ? `Sundeas — Retire at ${age}` : 'Sundeas' }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className="w-64 shrink-0 flex flex-col bg-sidebar h-screen sticky top-0 overflow-hidden"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="px-5 py-6 shrink-0">
          <Link
            href="/dashboard"
            className="flex items-baseline gap-0.5 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          >
            <span className="text-xl font-bold tracking-tight text-white">Sundeas</span>
          </Link>
        </div>

        {/* Nav scrolls if items overflow */}
        <div className="flex-1 overflow-y-auto">
          <AppNav />
        </div>

        {/* Widget + footer always visible at bottom */}
        <div className="shrink-0">
          <div className="px-3 pb-3">
            <RetirementWidget />
          </div>
          <div className="px-3 py-4 border-t border-white/10">
            <p className="text-xs text-slate-400 px-3 py-1 truncate" title={user.email ?? ''}>
              {user.email}
            </p>
            <SignOutButton />
            <div className="flex gap-3 px-3 pt-2">
              <Link href="/privacy" className="text-[10px] text-slate-500 hover:text-slate-300">Privacy</Link>
              <Link href="/terms" className="text-[10px] text-slate-500 hover:text-slate-300">Terms</Link>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen overflow-y-auto">
        <Providers>{children}</Providers>
      </main>
    </div>
  )
}
