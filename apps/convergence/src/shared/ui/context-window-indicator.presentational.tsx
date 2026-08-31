import type { FC } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

type SessionContextWindow =
  | {
      availability: 'available'
      source: 'provider' | 'estimated'
      usedTokens: number
      windowTokens: number
      usedPercentage: number
      remainingPercentage: number
    }
  | {
      availability: 'unavailable'
      source: 'provider' | 'estimated'
      reason: string
    }

interface ContextWindowIndicatorProps {
  contextWindow: SessionContextWindow | null | undefined
}

function formatFullTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export const ContextWindowIndicator: FC<ContextWindowIndicatorProps> = ({
  contextWindow,
}) => {
  if (!contextWindow) {
    return null
  }

  if (contextWindow.availability === 'unavailable') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center rounded-full border border-border/80 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Ctx n/a
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" className="max-w-72 py-2.5">
          <div className="space-y-1.5 text-[11px]">
            <p className="text-xs font-semibold tracking-[0.02em]">
              Context window unavailable
            </p>
            <p className="leading-relaxed text-muted-foreground">
              {contextWindow.reason}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    )
  }

  const circleLength = 2 * Math.PI * 7
  const dashOffset =
    circleLength - circleLength * (contextWindow.usedPercentage / 100)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-border hover:bg-muted/55">
          <svg
            className="h-4 w-4 shrink-0 -rotate-90"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.18"
              strokeWidth="2"
            />
            <circle
              cx="10"
              cy="10"
              r="7"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={circleLength}
              strokeDashoffset={dashOffset}
              className={cn(
                contextWindow.usedPercentage < 50 && 'text-emerald-500',
                contextWindow.usedPercentage >= 50 &&
                  contextWindow.usedPercentage < 80 &&
                  'text-warning',
                contextWindow.usedPercentage >= 80 && 'text-red-500',
              )}
            />
          </svg>
          <span>{contextWindow.remainingPercentage}% left</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-80 py-2.5">
        <div className="space-y-2 text-[11px]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold tracking-[0.02em]">
              Context window
            </p>
            <span className="rounded-full border border-border/70 bg-muted/45 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {contextWindow.source === 'provider'
                ? 'Provider-reported'
                : 'Estimated'}
            </span>
          </div>
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-medium text-foreground">
              {formatFullTokens(contextWindow.usedTokens)} /{' '}
              {formatFullTokens(contextWindow.windowTokens)} tokens
            </span>
            <span className="text-muted-foreground">Capacity</span>
            <span className="font-medium text-foreground">
              {contextWindow.usedPercentage}% used,{' '}
              {contextWindow.remainingPercentage}% left
            </span>
          </div>
          {contextWindow.source === 'estimated' && (
            <p className="max-w-72 border-t border-border/70 pt-2 leading-relaxed text-muted-foreground">
              Estimated from Claude turn token usage and the model&apos;s
              standard context window. Claude headless mode does not expose an
              exact live context meter yet.
            </p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
