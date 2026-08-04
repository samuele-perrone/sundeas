'use client'
import * as React from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogCtxValue {
  onOpenChange: (open: boolean) => void
}

const DialogCtx = React.createContext<DialogCtxValue>({ onOpenChange: () => {} })

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}) {
  return (
    <DialogCtx.Provider value={{ onOpenChange }}>
      {open ? children : null}
    </DialogCtx.Provider>
  )
}

function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  const { onOpenChange } = React.useContext(DialogCtx)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const prevFocusRef = React.useRef<HTMLElement | null>(null)

  React.useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement

    const focusable = contentRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl',
          'focus:outline-none',
          className
        )}
        tabIndex={-1}
        {...props}
      >
        {children}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close dialog"
          className={cn(
            'absolute right-4 top-4 rounded-lg p-1 text-muted-foreground',
            'hover:text-foreground hover:bg-secondary transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>,
    document.body
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('mb-5 pr-6', className)} {...props} />
}

function DialogTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      className={cn('text-lg font-semibold text-foreground leading-snug', className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p className={cn('mt-1 text-sm text-muted-foreground', className)} {...props} />
  )
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  )
}

function DialogClose({ className, children, onClick, ...props }: React.ComponentProps<'button'>) {
  const { onOpenChange } = React.useContext(DialogCtx)
  return (
    <button
      type="button"
      onClick={(e) => {
        onOpenChange(false)
        onClick?.(e)
      }}
      className={cn('', className)}
      {...props}
    >
      {children}
    </button>
  )
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose }
