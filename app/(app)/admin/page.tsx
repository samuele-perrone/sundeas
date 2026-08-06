'use client'
import { useEffect, useState, useCallback } from 'react'
import { ShieldCheck, ShieldOff, UserCheck, UserX, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

type User = {
  id: string
  email: string
  created_at: string
  role: 'user' | 'superadmin'
  approved: boolean
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const res = await fetch('/api/admin/users')
    if (!res.ok) { setError('Not authorised'); setLoading(false); return }
    setUsers(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
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
              {sorted.map(u => (
                <div key={u.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{u.email}</p>
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

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={u.approved ? 'outline' : 'default'}
                      disabled={updating === u.id}
                      onClick={() => update(u.id, { approved: !u.approved })}
                      title={u.approved ? 'Revoke access' : 'Approve access'}
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
                      title={u.role === 'superadmin' ? 'Remove SuperAdmin' : 'Make SuperAdmin'}
                    >
                      {u.role === 'superadmin'
                        ? <><ShieldOff className="w-3.5 h-3.5 mr-1.5" />Demote</>
                        : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Promote</>
                      }
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
