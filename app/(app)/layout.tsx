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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approved')
    .eq('id', user.id)
    .single()

  if (!profile?.approved) redirect('/unauthorised')

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
            className="flex items-center gap-2.5 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          >
            <svg viewBox="0 0 100 100" className="w-7 h-7 shrink-0" aria-hidden="true">
              <rect width="100" height="100" rx="22" fill="white" fillOpacity="0.12"/>
              <g transform="translate(50,52)">
                <path d="M-22 4 A22 22 0 0 1 22 4 Z" fill="white"/>
                <g stroke="white" strokeWidth="3" strokeLinecap="round" fill="none">
                  <line x1="0" y1="-34" x2="0" y2="-26"/>
                  <line x1="-24" y1="-24" x2="-19" y2="-18"/>
                  <line x1="24" y1="-24" x2="19" y2="-18"/>
                  <line x1="-30" y1="10" x2="30" y2="10"/>
                </g>
              </g>
            </svg>
            <span className="text-xl font-bold tracking-tight text-white">Sundeas</span>
          </Link>
        </div>

        {/* Nav scrolls if items overflow */}
        <div className="flex-1 overflow-y-auto">
          <AppNav role={profile.role} />
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
