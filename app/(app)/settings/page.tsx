import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import BackupSection from './BackupSection'
import DeleteAccountSection from './DeleteAccountSection'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="p-10 max-w-3xl">
      <h1 className="text-3xl font-bold tracking-tight mb-1">My Account</h1>
      <p className="text-sm text-muted-foreground mb-10">Manage your profile and data</p>

      {/* Profile */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm">{user?.email}</p>
          <p className="text-xs text-muted-foreground">Signed in with Google / Apple</p>
        </CardContent>
      </Card>

      <Separator className="my-6" />

      {/* Backup */}
      <div className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Backup &amp; Restore</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Export your data as an Excel file or restore from a previous backup.</p>
        </div>
        <BackupSection />
      </div>

      <Separator className="my-6" />

      <DeleteAccountSection />
    </div>
  )
}
