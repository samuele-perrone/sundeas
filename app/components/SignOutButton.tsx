'use client'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function SignOutButton() {
  const router = useRouter()
  const signOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className={[
        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400',
        'hover:text-white hover:bg-white/8 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
      ].join(' ')}
    >
      <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
      Sign out
    </button>
  )
}
