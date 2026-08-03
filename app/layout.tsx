import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Wealth — Retire at 57',
  description: 'Personal wealth management and retirement planning',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#f7f8fa] text-[#0f1117] antialiased">
        {children}
      </body>
    </html>
  )
}
