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
    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs"
    data-testid={testId}
  >
    <span className="flex w-4 shrink-0 text-ink-muted">{icon}</span>
    <span className="w-22 shrink-0 text-ink-muted">{label}</span>
    <span className="min-w-0 flex-1 truncate text-right text-ink">{value}</span>
  </div>
)
