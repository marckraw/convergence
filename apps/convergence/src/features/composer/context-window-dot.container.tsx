import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  ProviderInfo,
  SessionContextWindow,
  SessionSummary,
} from '@/entities/session'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { useAppSettingsStore } from '@/entities/app-settings'
import { useContextDrillStore } from '@/entities/context-drill'
import { cn } from '@/shared/lib/cn.pure'
import { resolveContextCompactionAction } from './context-compaction.pure'
import { resolveContextDrillAction } from './context-drill-action.pure'
import {
  describeContextAlert,
  getContextTone,
  type ContextWindowTone,
} from './context-window-tone.pure'

interface ContextWindowDotProps {
  contextWindow: SessionContextWindow | null | undefined
  session: SessionSummary
  provider: ProviderInfo | null | undefined
  onCompact: () => Promise<void>
  hasPendingQueuedInput?: boolean
}

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

function getAriaLabel(
  contextWindow: SessionContextWindow | null | undefined,
): string {
  if (!contextWindow) return 'Context window unavailable'
  if (contextWindow.availability === 'unavailable') {
    return 'Context window unavailable'
  }
  return `Context window ${contextWindow.remainingPercentage}% remaining`
}

export function ContextWindowDot({
  contextWindow,
  session,
  provider,
  onCompact,
  hasPendingQueuedInput = false,
}: ContextWindowDotProps) {
  const [open, setOpen] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [actionMessage, setActionMessage] = useState<{
    tone: 'success' | 'error'
    text: string
  } | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  // Read from the store rather than passed down: the store is refreshed by the
  // `appSettings:updated` broadcast, so changing the threshold recolours an
  // already-open conversation's dot without a reload.
  const contextAlert = useAppSettingsStore((s) => s.settings.contextAlert)
  const tone = getContextTone(contextWindow, contextAlert)
  const alertLine = describeContextAlert(contextWindow, contextAlert)
  const compaction = resolveContextCompactionAction(session, provider, {
    hasPendingQueuedInput,
  })

  const drillDescription = useContextDrillStore(
    (s) => s.descriptions[session.id],
  )
  const drillBeat = useContextDrillStore((s) => s.beats[session.id]) ?? null
  const refreshDrill = useContextDrillStore((s) => s.refresh)
  const drill = resolveContextDrillAction(drillDescription, drillBeat)
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null)

  /**
   * Re-ask the backend whenever something it would answer differently about
   * has moved: the conversation itself, its turn, what it is waiting for, and
   * whether a send is queued behind it.
   *
   * Every one of those is a value this component already re-renders on, which
   * is the whole reason there is no interval here. A beat starting or ending
   * arrives separately, on `contextDrill:changed`, and the ending re-asks on
   * its own (the store's `handleChange`) -- so the two halves of "is it
   * offered" are both pushed, and nothing is polled.
   */
  useEffect(() => {
    void refreshDrill(session.id)
  }, [
    refreshDrill,
    session.id,
    session.status,
    session.attention,
    session.activity,
    hasPendingQueuedInput,
  ])

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

  useEffect(() => clearCloseTimer, [clearCloseTimer])
  useEffect(() => {
    setActionMessage(null)
    setCancelRefusal(null)
  }, [session.id])

  const compact = useCallback(async () => {
    clearCloseTimer()
    setActionMessage(null)
    setIsCompacting(true)
    try {
      await onCompact()
      setActionMessage({ tone: 'success', text: 'Context compacted.' })
    } catch (error) {
      setActionMessage({
        tone: 'error',
        text: error instanceof Error ? error.message : 'Compaction failed.',
      })
    } finally {
      setIsCompacting(false)
    }
  }, [clearCloseTimer, onCompact])

  /**
   * Started, not awaited.
   *
   * The routine takes minutes and this popover closes when the pointer
   * leaves it, so there is nothing here to await into. The store owns the
   * promise and records the ending; what this component shows next is the
   * beat, which arrives on `contextDrill:changed`.
   */
  const runDrill = useCallback(() => {
    clearCloseTimer()
    setCancelRefusal(null)
    void useContextDrillStore.getState().run(session.id)
  }, [clearCloseTimer, session.id])

  const cancelDrill = useCallback(() => {
    clearCloseTimer()
    void useContextDrillStore
      .getState()
      .cancel(session.id)
      .then(setCancelRefusal)
  }, [clearCloseTimer, session.id])

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
            {alertLine ? (
              <p className="text-[11px] leading-relaxed text-amber-400">
                {alertLine}
              </p>
            ) : null}
          </div>
        )}

        {compaction.visible ? (
          <div className="space-y-2 border-t border-border/70 pt-3">
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={
                !compaction.enabled || isCompacting || drillBeat !== null
              }
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                void compact()
              }}
            >
              {isCompacting || session.activity === 'compacting'
                ? 'Compacting context…'
                : 'Compact context'}
            </Button>
            {!compaction.enabled && compaction.reason ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {compaction.reason}
              </p>
            ) : provider?.contextManagement?.compact.availability ===
              'runtime-check' ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Availability is verified against the installed provider when you
                run it.
              </p>
            ) : null}
            {actionMessage ? (
              <p
                className={cn(
                  'text-[11px] leading-relaxed',
                  actionMessage.tone === 'success'
                    ? 'text-emerald-400'
                    : 'text-destructive',
                )}
              >
                {actionMessage.text}
              </p>
            ) : null}
          </div>
        ) : null}

        {drill.visible ? (
          <div className="space-y-2 border-t border-border/70 pt-3">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="w-full"
              disabled={!drill.enabled}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                runDrill()
              }}
            >
              {drill.label}
            </Button>
            {drill.cancel.visible ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="w-full"
                disabled={!drill.cancel.enabled}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  cancelDrill()
                }}
              >
                Cancel
              </Button>
            ) : null}
            {drill.cancel.visible && drill.cancel.reason ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {drill.cancel.reason}
              </p>
            ) : !drill.enabled && drill.reason ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {drill.reason}
              </p>
            ) : null}
            {cancelRefusal ? (
              <p className="text-[11px] leading-relaxed text-destructive">
                {cancelRefusal}
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
