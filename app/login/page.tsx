'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/api/auth/callback` },
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-baseline gap-0.5 mb-1">
            <span className="text-xl font-bold tracking-tight">Wealth</span>
            <span className="text-xl font-bold text-primary">.</span>
          </div>
          <CardTitle className="text-lg">Sign in</CardTitle>
          <CardDescription>We'll send a magic link to your email.</CardDescription>
        </CardHeader>

        <CardContent>
          {sent ? (
            <div
              role="status"
              aria-live="polite"
              className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-4"
            >
              Check your email — we sent a magic link to <strong>{email}</strong>.
            </div>
          ) : (
            <form onSubmit={signIn} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  placeholder="your@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Sending…' : 'Send magic link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
