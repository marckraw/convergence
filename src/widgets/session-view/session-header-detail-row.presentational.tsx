import type { FC, ReactNode } from 'react'

interface SessionHeaderDetailRowProps {
  icon?: ReactNode
  label: string
  value: string
  testId?: string
}

export const SessionHeaderDetailRow: FC<SessionHeaderDetailRowProps> = ({
  icon,
  label,
  value,
  testId,
}) => (
  <div
    className="grid grid-cols-[1rem_5.5rem_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-xs"
    data-testid={testId}
  >
    <span className="text-muted-foreground">{icon}</span>
    <span className="text-muted-foreground">{label}</span>
    <span className="min-w-0 truncate text-right text-foreground">{value}</span>
  </div>
)
