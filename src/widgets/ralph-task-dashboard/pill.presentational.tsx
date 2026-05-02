import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface PillProps {
  children: ReactNode
  className: string
}

export function Pill({ children, className }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center rounded border px-2 py-0.5 text-[11px] font-medium',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  )
}
