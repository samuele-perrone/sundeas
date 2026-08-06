import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export const metadata = { title: 'Access Denied — Sundeas' }

export default function UnauthorisedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 gap-6">
      <Card className="w-full max-w-sm shadow-md">
        <CardHeader>
          <CardTitle>Access denied</CardTitle>
          <CardDescription>
            Sundeas is currently invite-only. Your account has not been granted access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            To request access, email{' '}
            <a href="mailto:hello@sundeas.com" className="underline hover:text-foreground">
              hello@sundeas.com
            </a>
          </p>
        </CardContent>
      </Card>
      <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to sign in
      </Link>
    </div>
  )
}
