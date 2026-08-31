import type { FC, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface SettingsSubsectionProps {
  title: string
  description?: string
  children: ReactNode
  withDivider?: boolean
}

export const SettingsSubsection: FC<SettingsSubsectionProps> = ({
  title,
  description,
  children,
  withDivider = false,
}) => (
  <section
    className={cn('space-y-3', withDivider && 'border-t border-border/60 pt-6')}
  >
    <div>
      <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      {description ? (
        <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
    {children}
  </section>
)
