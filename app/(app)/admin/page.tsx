'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ShieldCheck, ShieldOff, UserCheck, UserX, RefreshCw, UserPlus, Send, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

type User = {
  id: string
  email: string
  created_at: string
  role: 'user' | 'superadmin'
  approved: boolean
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [sendingDigest, setSendingDigest] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/users')
    if (!res.ok) { setError('Not authorised'); setLoading(false); return }
    setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    createClient().auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null))
  }, [load])

  async function update(id: string, patch: Partial<Pick<User, 'role' | 'approved'>>) {
    setUpdating(id)
    const res = await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Update failed')
    } else {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
    }
    setUpdating(null)
  }

  async function sendDigest(userId: string) {
    setSendingDigest(userId)
    await fetch('/api/admin/send-digest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    setSendingDigest(null)
  }

  async function resendInvite(email: string) {
    setResending(email)
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setResending(null)
  }

  async function handleInvite() {
    setInviting(true)
    setInviteError(null)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    if (!res.ok) {
      const body = await res.json()
      setInviteError(body.error ?? 'Invite failed')
      setInviting(false)
      return
    }
    setInviteSuccess(true)
    setInviting(false)
    await load()
  }

  function openInvite() {
    setInviteOpen(true)
    setInviteEmail('')
    setInviteError(null)
    setInviteSuccess(false)
  }

  const sorted = [...users].sort((a, b) => {
    if (a.role === 'superadmin' && b.role !== 'superadmin') return -1
    if (b.role === 'superadmin' && a.role !== 'superadmin') return 1
    if (a.approved && !b.approved) return -1
    if (b.approved && !a.approved) return 1
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">Approve access and manage roles</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openInvite}>
            <UserPlus className="w-4 h-4 mr-2" />
            Add user
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 text-destructive text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">All users</CardTitle>
          <CardDescription>{users.length} total · {users.filter(u => u.approved).length} approved</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">No users found</div>
          ) : (
            <div className="divide-y">
              {sorted.map(u => {
                const isSelf = u.id === currentUserId
                return (
                  <div key={u.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {u.email}
                        {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Joined {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={u.role === 'superadmin' ? 'default' : 'secondary'}>
                        {u.role === 'superadmin' ? 'SuperAdmin' : 'User'}
                      </Badge>
                      <Badge variant={u.approved ? 'outline' : 'destructive'} className="text-xs">
                        {u.approved ? 'Approved' : 'Pending'}
                      </Badge>
                    </div>

                    {!isSelf && (
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingDigest === u.id}
                          onClick={() => sendDigest(u.id)}
                          title="Send investment digest email"
                        >
                          <Mail className="w-3.5 h-3.5 mr-1.5" />
                          {sendingDigest === u.id ? 'Sending…' : 'Send digest'}
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={resending === u.email}
                          onClick={() => resendInvite(u.email)}
                          title="Resend invite email"
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" />
                          {resending === u.email ? 'Sending…' : 'Resend'}
                        </Button>

                        <Button
                          size="sm"
                          variant={u.approved ? 'outline' : 'default'}
                          disabled={updating === u.id}
                          onClick={() => update(u.id, { approved: !u.approved })}
                        >
                          {u.approved
                            ? <><UserX className="w-3.5 h-3.5 mr-1.5" />Revoke</>
                            : <><UserCheck className="w-3.5 h-3.5 mr-1.5" />Approve</>
                          }
                        </Button>

                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updating === u.id}
                          onClick={() => update(u.id, { role: u.role === 'superadmin' ? 'user' : 'superadmin' })}
                        >
                          {u.role === 'superadmin'
                            ? <><ShieldOff className="w-3.5 h-3.5 mr-1.5" />Demote</>
                            : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Promote</>
                          }
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <AlertDialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Add user</AlertDialogTitle>
            <AlertDialogDescription>
              Enter their email address. They'll receive an invite link and be automatically approved.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {inviteSuccess ? (
            <div className="py-4 text-sm text-center text-green-600 font-medium">
              Invite sent to {inviteEmail}
            </div>
          ) : (
            <div className="py-2 space-y-2">
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && inviteEmail && !inviting && handleInvite()}
              />
              {inviteError && <p className="text-sm text-destructive">{inviteError}</p>}
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={inviting} onClick={() => setInviteOpen(false)}>
              {inviteSuccess ? 'Close' : 'Cancel'}
            </AlertDialogCancel>
            {!inviteSuccess && (
              <Button disabled={!inviteEmail || inviting} onClick={handleInvite}>
                {inviting ? 'Sending…' : 'Send invite'}
              </Button>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
