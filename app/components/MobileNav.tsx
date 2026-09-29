'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, ArrowLeftRight, Target, MessageSquare, Settings, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/budget', label: 'Budget', icon: ArrowLeftRight },
  { href: '/plan', label: 'Plan', icon: Target },
  { href: '/advisor', label: 'Advisor', icon: MessageSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export default function MobileNav({ role }: { role?: string }) {
  const pathname = usePathname()
  const nav = role === 'superadmin'
    ? [...NAV, { href: '/admin', label: 'Admin', icon: ShieldCheck }]
    : NAV

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-sidebar border-t border-white/10 flex safe-area-bottom"
      aria-label="Mobile navigation"
    >
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors min-w-0',
              active ? 'text-white' : 'text-slate-500'
            )}
          >
            <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
            <span className="text-[10px] font-medium truncate">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
