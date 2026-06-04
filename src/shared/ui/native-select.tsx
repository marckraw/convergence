import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'

export type NativeSelectProps =
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    selectSize?: 'sm' | 'default'
  }

const sizeClasses: Record<
  NonNullable<NativeSelectProps['selectSize']>,
  string
> = {
  sm: 'h-8 px-2.5 pr-8 text-xs',
  default: 'h-9 px-3 pr-9 text-sm',
}

const iconSizeClasses: Record<
  NonNullable<NativeSelectProps['selectSize']>,
  string
> = {
  sm: 'right-2 h-3.5 w-3.5',
  default: 'right-2.5 h-4 w-4',
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, selectSize = 'default', children, ...props }, ref) => {
    return (
      <div className="relative w-full">
        <select
          ref={ref}
          className={cn(
            'w-full appearance-none rounded-md border border-input bg-background font-normal text-foreground shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            sizeClasses[selectSize],
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground',
            iconSizeClasses[selectSize],
          )}
        />
      </div>
    )
  },
)
NativeSelect.displayName = 'NativeSelect'

export { NativeSelect }
