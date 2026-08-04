import * as React from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive' | 'link'
type Size = 'default' | 'sm' | 'lg' | 'icon'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantClasses: Record<Variant, string> = {
  default:
    'bg-primary text-primary-foreground hover:bg-indigo-700 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  outline:
    'border border-border bg-white text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  ghost:
    'text-foreground hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  secondary:
    'bg-secondary text-secondary-foreground hover:bg-slate-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
  destructive:
    'bg-destructive text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1',
  link: 'text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
}

const sizeClasses: Record<Size, string> = {
  default: 'h-10 px-4 py-2 text-sm',
  sm: 'h-8 px-3 py-1.5 text-xs',
  lg: 'h-12 px-6 py-3 text-base',
  icon: 'h-9 w-9',
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors',
        'focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:pointer-events-none [&_svg]:shrink-0',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    />
  )
}

export { Button, type ButtonProps }
