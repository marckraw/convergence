import { cn } from '@/shared/lib/cn.pure'

interface ClaudeUsageRingProps {
  value: number | null
  isLoading: boolean
}

export function ClaudeUsageRing({ value, isLoading }: ClaudeUsageRingProps) {
  const safeValue =
    typeof value === 'number' ? Math.max(0, Math.min(100, value)) : 0

  return (
    <span className="relative grid h-5 w-5 place-items-center">
      <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20" aria-hidden>
        <circle
          cx="10"
          cy="10"
          r="7"
          fill="none"
          strokeWidth="3"
          className="stroke-border/80"
        />
        <circle
          cx="10"
          cy="10"
          r="7"
          fill="none"
          pathLength={100}
          strokeDasharray={`${safeValue} ${100 - safeValue}`}
          strokeLinecap="round"
          strokeWidth="3"
          className={cn('stroke-blue-400', isLoading && 'animate-pulse')}
        />
      </svg>
    </span>
  )
}
