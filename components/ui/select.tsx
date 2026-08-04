'use client'
import * as React from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SelectCtxValue {
  value: string
  onValueChange: (v: string) => void
  open: boolean
  setOpen: (v: boolean) => void
}

const SelectCtx = React.createContext<SelectCtxValue>({
  value: '',
  onValueChange: () => {},
  open: false,
  setOpen: () => {},
})

function Select({
  value = '',
  onValueChange = () => {},
  children,
}: {
  value?: string
  onValueChange?: (v: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  return (
    <SelectCtx.Provider value={{ value, onValueChange, open, setOpen }}>
      <div className="relative" ref={containerRef}>
        {children}
      </div>
    </SelectCtx.Provider>
  )
}

function SelectTrigger({
  id,
  className,
  children,
  'aria-label': ariaLabel,
}: {
  id?: string
  className?: string
  children?: React.ReactNode
  'aria-label'?: string
}) {
  const { open, setOpen } = React.useContext(SelectCtx)
  return (
    <button
      id={id}
      type="button"
      role="combobox"
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-label={ariaLabel}
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-white px-3 text-sm text-foreground',
        'transition-colors outline-none',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        aria-hidden="true"
      />
    </button>
  )
}

function SelectValue({
  children,
  placeholder,
}: {
  children?: React.ReactNode
  placeholder?: string
}) {
  const { value } = React.useContext(SelectCtx)
  if (children) {
    return <span className="flex-1 text-left truncate">{children}</span>
  }
  return (
    <span className={cn('flex-1 text-left truncate', !value && 'text-muted-foreground')}>
      {value || placeholder}
    </span>
  )
}

function SelectContent({ children }: { children: React.ReactNode }) {
  const { open } = React.useContext(SelectCtx)
  if (!open) return null
  return (
    <div
      role="listbox"
      className={cn(
        'absolute top-full left-0 right-0 z-50 mt-1 rounded-xl border border-border bg-white shadow-lg',
        'max-h-60 overflow-y-auto py-1'
      )}
    >
      {children}
    </div>
  )
}

function SelectItem({
  value,
  children,
}: {
  value: string
  children: React.ReactNode
}) {
  const ctx = React.useContext(SelectCtx)
  const selected = ctx.value === value
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        ctx.onValueChange(value)
        ctx.setOpen(false)
      }}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm text-left',
        'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none',
        'transition-colors'
      )}
    >
      <Check
        className={cn('h-4 w-4 shrink-0 text-primary', selected ? 'opacity-100' : 'opacity-0')}
        aria-hidden="true"
      />
      {children}
    </button>
  )
}

function SelectGroup({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>
}

function SelectLabel({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('px-3 py-1.5 text-xs font-semibold text-muted-foreground', className)}>
      {children}
    </div>
  )
}

function SelectSeparator({ className }: { className?: string }) {
  return <div className={cn('-mx-1 my-1 h-px bg-border', className)} />
}

export {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
}
