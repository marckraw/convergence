import { useCallback, useRef, useState } from 'react'
import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover'
import { RefreshCw } from 'lucide-react'
import {
  formatClaudeUsagePillValue,
  getClaudeWindow,
  getPrimaryClaudeWindow,
} from './claude-usage-pill.pure'
import { ClaudeUsageRing } from './claude-usage-ring.presentational'
import { ClaudeUsageWindowRow } from './claude-usage-window-row.presentational'

interface ClaudeUsagePillContainerProps {
  snapshot: ProviderQuotaSnapshot | null
  isLoading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
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

export function ClaudeUsagePillContainer({
  snapshot,
  isLoading,
  onRefresh,
  onOpenSettings,
}: ClaudeUsagePillContainerProps) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const primary = getPrimaryClaudeWindow(snapshot)
  const weekly = getClaudeWindow(snapshot, 'weekly')
  const label = formatClaudeUsagePillValue(primary)
  const progress = primary?.usedPercent ?? null
  const unavailableReason =
    snapshot?.status === 'unavailable' ? snapshot.reason : null
  const isAvailable = snapshot?.status === 'available'

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
              isAvailable
                ? 'border-blue-700/55 bg-blue-950/45 text-blue-100 hover:border-blue-600/80 hover:bg-blue-950/55 hover:text-blue-100'
                : 'border-border/80 bg-muted/30 text-muted-foreground hover:border-border hover:bg-muted/40 hover:text-muted-foreground',
            )}
            aria-label={`Claude Code usage ${label}`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              openPanel()
            }}
          >
            <ClaudeUsageRing value={progress} isLoading={isLoading} />
            <span>Claude {label}</span>
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
              Claude Code usage
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
            aria-label="Refresh Claude Code usage"
          >
            <RefreshCw
              className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
            />
          </Button>
        </div>

        {isAvailable ? (
          <div className="space-y-2">
            <ClaudeUsageWindowRow label="5 hour" window={primary} />
            <ClaudeUsageWindowRow label="Weekly" window={weekly} />
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-3 py-2 text-xs leading-relaxed text-muted-foreground">
            {unavailableReason ?? 'Claude Code usage is unavailable.'}
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
