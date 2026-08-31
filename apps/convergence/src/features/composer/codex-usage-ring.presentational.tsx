import { cn } from '@/shared/lib/cn.pure'
import type { CodexUsageTone } from './codex-usage-pill.pure'

interface CodexUsageRingProps {
  value: number | null
  tone: CodexUsageTone
  isLoading: boolean
}

const strokeClass: Record<CodexUsageTone, string> = {
  green: 'stroke-emerald-400',
  amber: 'stroke-amber-400',
  red: 'stroke-rose-400',
  muted: 'stroke-muted-foreground',
}

export function CodexUsageRing({
  value,
  tone,
  isLoading,
}: CodexUsageRingProps) {
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
          className={cn(strokeClass[tone], isLoading && 'animate-pulse')}
        />
      </svg>
    </span>
  )
}
