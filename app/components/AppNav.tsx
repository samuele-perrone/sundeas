'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Wallet, ArrowLeftRight, Target, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/accounts', label: 'Accounts', icon: Wallet },
  { href: '/budget', label: 'Budget', icon: ArrowLeftRight },
  { href: '/plan', label: 'Retirement plan', icon: Target },
  { href: '/advisor', label: 'Advisor', icon: MessageSquare },
]

export default function AppNav() {
  const pathname = usePathname()

  return (
    <nav className="flex-1 px-3 py-2 flex flex-col gap-0.5" aria-label="App sections">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
              active
                ? 'bg-indigo-600 text-white font-medium'
                : 'text-slate-400 hover:text-white hover:bg-white/8'
            )}
          >
            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
