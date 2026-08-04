import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SignOutButton from '@/app/components/SignOutButton'
import AppNav from '@/app/components/AppNav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className="w-64 shrink-0 flex flex-col bg-sidebar"
        aria-label="Main navigation"
      >
        {/* Logo */}
        <div className="px-5 py-6">
          <Link
            href="/dashboard"
            className="flex items-baseline gap-0.5 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
          >
            <span className="text-xl font-bold tracking-tight text-white">Wealth</span>
            <span className="text-xl font-bold text-indigo-400">.</span>
          </Link>
        </div>

        <AppNav />

        {/* Footer */}
        <div className="mt-auto px-3 py-4 border-t border-white/10">
          <p className="text-xs text-slate-400 px-3 py-1 truncate" title={user.email ?? ''}>
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      <main className="flex-1 min-h-screen overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
