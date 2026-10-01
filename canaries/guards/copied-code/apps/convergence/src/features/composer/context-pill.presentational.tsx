// The context-window pill, pasted from the usage pill and renamed: a pasted component.
import { cn } from '@convergence/ui'

export interface ContextPillProps {
  label: string
  used: number
  limit: number
  onOpen: () => void
}

export function ContextPill({ label, used, limit, onOpen }: ContextPillProps) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0
  const tone = ratio > 0.9 ? 'danger' : ratio > 0.7 ? 'warning' : 'muted'
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('rounded-full px-2 text-xs', tone)}
      aria-label={`${label}: ${Math.round(ratio * 100)}% used`}
    >
      <span>{label}</span>
      <span>{Math.round(ratio * 100)}%</span>
    </button>
  )
}
