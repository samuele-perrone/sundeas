'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const signIn = async (provider: 'google' | 'apple') => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/api/auth/callback` },
    })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f7f8fa]">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-[#e4e7ec] p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-[#0f1117] mb-1">Wealth</h1>
        <p className="text-sm text-[#6b7280] mb-8">Your retirement plan, tracked.</p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => signIn('google')}
            className="w-full py-2.5 px-4 rounded-xl border border-[#e4e7ec] text-sm font-medium hover:bg-[#f7f8fa] transition-colors"
          >
            Continue with Google
          </button>
          <button
            onClick={() => signIn('apple')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#0f1117] text-white text-sm font-medium hover:bg-[#1a1d27] transition-colors"
          >
            Continue with Apple
          </button>
        </div>
      </div>
    </div>
  )
}
