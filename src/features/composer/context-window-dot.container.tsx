import { useCallback, useRef, useState } from 'react'
import type { SessionContextWindow } from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { cn } from '@/shared/lib/cn.pure'

interface ContextWindowDotProps {
  contextWindow: SessionContextWindow | null | undefined
}

type ContextWindowTone = 'green' | 'amber' | 'red' | 'muted'

const dotClass: Record<ContextWindowTone, string> = {
  green: 'bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.16)]',
  amber: 'bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.16)]',
  red: 'bg-rose-400 shadow-[0_0_0_3px_rgba(251,113,133,0.18)]',
  muted: 'bg-muted-foreground/55 shadow-[0_0_0_3px_rgba(148,163,184,0.12)]',
}

const buttonClass: Record<ContextWindowTone, string> = {
  green:
    'border-emerald-700/45 bg-emerald-950/35 hover:border-emerald-600/70 hover:bg-emerald-950/45',
  amber:
    'border-amber-600/45 bg-amber-950/35 hover:border-amber-500/70 hover:bg-amber-950/45',
  red: 'border-rose-600/45 bg-rose-950/35 hover:border-rose-500/70 hover:bg-rose-950/45',
  muted: 'border-border/80 bg-muted/25 hover:border-border hover:bg-muted/35',
}

function formatFullTokens(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

function getContextTone(
  contextWindow: SessionContextWindow | null | undefined,
): ContextWindowTone {
  if (!contextWindow || contextWindow.availability === 'unavailable') {
    return 'muted'
  }

  if (contextWindow.remainingPercentage <= 15) return 'red'
  if (contextWindow.remainingPercentage <= 35) return 'amber'
  return 'green'
}

function getAriaLabel(
  contextWindow: SessionContextWindow | null | undefined,
): string {
  if (!contextWindow) return 'Context window unavailable'
  if (contextWindow.availability === 'unavailable') {
    return 'Context window unavailable'
  }
  return `Context window ${contextWindow.remainingPercentage}% remaining`
}

export function ContextWindowDot({ contextWindow }: ContextWindowDotProps) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const tone = getContextTone(contextWindow)

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const openPanel = useCallback(() => {
    clearCloseTimer()
    setOpen(true)
  }, [clearCloseTimer])

  const closePanelSoon = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 120)
  }, [clearCloseTimer])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span onPointerEnter={openPanel} onPointerLeave={closePanelSoon}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              'h-7 w-7 shrink-0 rounded-full border shadow-none',
              buttonClass[tone],
            )}
            aria-label={getAriaLabel(contextWindow)}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openPanel()
            }}
          >
            <span
              className={cn('h-2.5 w-2.5 rounded-full', dotClass[tone])}
              aria-hidden="true"
            />
          </Button>
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        className="w-80 space-y-3 rounded-xl border-border/80 bg-popover/95 p-3 text-popover-foreground shadow-xl backdrop-blur-xl"
        onPointerEnter={openPanel}
        onPointerLeave={closePanelSoon}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div>
          <p className="text-sm font-semibold text-popover-foreground">
            Context window
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Current conversation capacity, separate from provider usage limits.
          </p>
        </div>

        {!contextWindow ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            Context usage has not been reported for this session yet.
          </p>
        ) : contextWindow.availability === 'unavailable' ? (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {contextWindow.reason}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 text-xs">
              <span className="font-medium text-popover-foreground">
                Remaining
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full',
                    tone === 'green' && 'bg-emerald-400',
                    tone === 'amber' && 'bg-amber-400',
                    tone === 'red' && 'bg-rose-400',
                    tone === 'muted' && 'bg-muted-foreground',
                  )}
                  style={{ width: `${contextWindow.remainingPercentage}%` }}
                />
              </div>
              <span className="text-right font-medium text-popover-foreground">
                {contextWindow.remainingPercentage}%
              </span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 border-t border-border/70 pt-2 text-xs">
              <span className="text-muted-foreground">Used</span>
              <span className="font-medium text-popover-foreground">
                {contextWindow.usedPercentage}% ·{' '}
                {formatFullTokens(contextWindow.usedTokens)} tokens
              </span>
              <span className="text-muted-foreground">Window</span>
              <span className="font-medium text-popover-foreground">
                {formatFullTokens(contextWindow.windowTokens)} tokens
              </span>
              <span className="text-muted-foreground">Source</span>
              <span className="font-medium text-popover-foreground">
                {contextWindow.source === 'provider'
                  ? 'Provider-reported'
                  : 'Estimated'}
              </span>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
