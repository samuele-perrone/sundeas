'use client'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface AlertDialogCtxValue {
  onOpenChange: (open: boolean) => void
}

const AlertDialogCtx = React.createContext<AlertDialogCtxValue>({ onOpenChange: () => {} })

function AlertDialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <AlertDialogCtx.Provider value={{ onOpenChange }}>
      {open ? children : null}
    </AlertDialogCtx.Provider>
  )
}

function AlertDialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const { onOpenChange } = React.useContext(AlertDialogCtx)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const prevFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement
    const focusable = contentRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    focusable?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange(false)
        return
      }
      if (e.key !== 'Tab') return
      const all = Array.from(
        contentRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      )
      if (!all.length) return
      const first = all[0]
      const last = all[all.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prevFocusRef.current?.focus()
    }
  }, [onOpenChange])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        ref={contentRef}
        role="alertdialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl focus:outline-none',
          className
        )}
        tabIndex={-1}
        {...props}
      >
        {children}
      </div>
    </div>,
    document.body
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-4 space-y-1', className)} {...props} />
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2 className={cn('text-lg font-semibold text-foreground', className)} {...props} />
  )
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function AlertDialogAction({ className, ...props }: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'bg-primary text-primary-foreground hover:bg-indigo-700',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({ className, children, ...props }: React.ComponentProps<'button'>) {
  const { onOpenChange } = React.useContext(AlertDialogCtx)
  return (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium',
        'bg-white text-foreground hover:bg-secondary transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

function AlertDialogTrigger({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogPortal({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({ className }: { className?: string }) {
  return null
}

export {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
}
