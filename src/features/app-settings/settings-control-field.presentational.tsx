import type { FC, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface SettingsControlFieldProps {
  title: string
  description: string
  children: ReactNode
  className?: string
}

export const SettingsControlField: FC<SettingsControlFieldProps> = ({
  title,
  description,
  children,
  className,
}) => (
  <div
    className={cn(
      'grid gap-3 rounded-xl border border-border/70 bg-card/45 p-4',
      'md:grid-cols-[minmax(0,1fr)_17rem] md:items-start',
      className,
    )}
  >
    <div className="space-y-1">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
    <div className="min-w-0 md:w-[17rem] md:justify-self-end">{children}</div>
  </div>
)
