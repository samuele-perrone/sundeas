'use client'
import * as React from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CheckboxProps {
  id?: string
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  className?: string
  'aria-describedby'?: string
}

function Checkbox({
  id,
  checked,
  onCheckedChange,
  disabled,
  className,
  'aria-describedby': ariaDescribedby,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      id={id}
      aria-checked={checked}
      aria-describedby={ariaDescribedby}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'disabled:cursor-not-allowed disabled:opacity-50',
        checked ? 'border-primary bg-primary text-white' : 'border-input bg-white',
        className
      )}
    >
      {checked && (
        <Check className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
      )}
    </button>
  )
}

export { Checkbox }
