import { useCallback, useRef, useState } from 'react'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { cn } from '@/shared/lib/cn.pure'
import { RefreshCw } from 'lucide-react'
import {
  formatCodexRemainingPercent,
  getCodexUsageTone,
  type CodexUsageTone,
} from './codex-usage-pill.pure'
import {
  formatCursorWindowLabel,
  getPrimaryCursorWindow,
} from './cursor-usage-pill.pure'
import { CodexUsageQuotaRow } from './codex-usage-quota-row.presentational'
import { CodexUsageRing } from './codex-usage-ring.presentational'

interface CursorUsagePillContainerProps {
  snapshot: ProviderQuotaSnapshot | null
  isLoading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
}

const toneClass: Record<CodexUsageTone, string> = {
  green:
    'border-emerald-700/55 bg-emerald-950/45 text-emerald-100 hover:border-emerald-600/80 hover:bg-emerald-950/55 hover:text-emerald-100',
  amber:
    'border-amber-600/55 bg-amber-950/45 text-amber-100 hover:border-amber-500/80 hover:bg-amber-950/55 hover:text-amber-100',
  red: 'border-rose-600/55 bg-rose-950/45 text-rose-100 hover:border-rose-500/80 hover:bg-rose-950/55 hover:text-rose-100',
  muted:
    'border-border/80 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-muted-foreground',
}

function formatCheckedAt(value: string | null | undefined): string {
  if (!value) return 'not checked'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'not checked'
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function CursorUsagePillContainer({
  snapshot,
  isLoading,
  onRefresh,
  onOpenSettings,
}: CursorUsagePillContainerProps) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const primary = getPrimaryCursorWindow(snapshot)
  const remaining = primary?.remainingPercent ?? null
  const tone = getCodexUsageTone(remaining)
  const label = formatCodexRemainingPercent(remaining)
  const unavailableReason =
    snapshot?.status === 'unavailable' ? snapshot.reason : null

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
            size="sm"
            className={cn(
              'h-7 shrink-0 rounded-full border px-2 text-xs font-semibold shadow-none',
              toneClass[tone],
            )}
            aria-label={`Cursor usage ${label} remaining`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openPanel()
            }}
          >
            <CodexUsageRing
              value={remaining}
              tone={tone}
              isLoading={isLoading}
            />
            <span>Cursor {label}</span>
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
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-popover-foreground">
              Cursor usage
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              checked {formatCheckedAt(snapshot?.lastCheckedAt)}
              {snapshot?.status === 'available' && snapshot.stale
                ? ' (stale)'
                : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onRefresh()
            }}
            aria-label="Refresh Cursor usage"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
            />
          </Button>
        </div>

        {snapshot?.status === 'available' ? (
          <div className="space-y-2">
            {snapshot.windows.length > 0 ? (
              snapshot.windows.map((window) => (
                <CodexUsageQuotaRow
                  key={`${window.kind}-${window.label}-${window.resetsAt ?? 'none'}`}
                  label={formatCursorWindowLabel(window)}
                  remaining={window.remainingPercent}
                  reset={window.resetsAt}
                />
              ))
            ) : (
              <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                Cursor team spend is available, but no hard spend limit was
                reported.
              </p>
            )}
            {snapshot.details && snapshot.details.length > 0 ? (
              <div className="space-y-1 border-t border-border/70 pt-2 text-xs text-muted-foreground">
                {snapshot.details.slice(0, 3).map((detail) => (
                  <p key={detail} className="truncate">
                    {detail}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {unavailableReason ?? 'Cursor usage is unavailable.'}
          </p>
        )}

        <div className="flex items-center justify-between border-t border-border/70 pt-2 text-[11px] text-muted-foreground">
          <span>Refreshes quietly while visible</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto px-0 py-0 text-[11px] font-medium text-blue-300 shadow-none hover:bg-transparent hover:text-blue-200"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onOpenSettings()
            }}
          >
            Settings
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
