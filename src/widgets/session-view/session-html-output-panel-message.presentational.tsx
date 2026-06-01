import type { FC, ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'

interface SessionHtmlOutputPanelMessageProps {
  icon: ReactNode
  title: string
  message: string
  testId: string
  warning?: boolean
}

export const SessionHtmlOutputPanelMessage: FC<
  SessionHtmlOutputPanelMessageProps
> = ({ icon, title, message, testId, warning = false }) => (
  <div
    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center"
    data-testid={testId}
  >
    <div
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-md border',
        warning
          ? 'border-warning/30 bg-warning/10 text-warning-foreground'
          : 'border-border bg-muted text-muted-foreground',
      )}
    >
      {icon}
    </div>
    <div className="max-w-sm space-y-1">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs leading-5 text-muted-foreground">{message}</p>
    </div>
  </div>
)
