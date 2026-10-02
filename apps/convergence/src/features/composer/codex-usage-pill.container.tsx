import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import {
  Button,
  cn,
  IconButton,
  Meter,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
} from '@convergence/ui'
import { RefreshCw } from 'lucide-react'
import {
  describeCodexUsagePill,
  getCodexUsageTone,
  getCodexWindow,
  getPrimaryCodexWindow,
  isCodexUsageWarmingUp,
} from './codex-usage-pill.pure'
import { CodexUsageQuotaRow } from './codex-usage-quota-row.presentational'
import {
  renderUsageHeading,
  renderUsageNote,
} from './usage-popover.presentational'
import { usagePillTone, usageSection } from './usage-pill.styles'
import { useHoverPopover } from './use-hover-popover'

interface CodexUsagePillContainerProps {
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

export function CodexUsagePillContainer({
  snapshot,
  isLoading,
  onRefresh,
  onOpenSettings,
}: CodexUsagePillContainerProps) {
  const { open, setOpen, openPanel, closePanelSoon } = useHoverPopover()
  const primary = getPrimaryCodexWindow(snapshot)
  const weekly = getCodexWindow(snapshot, 'weekly')
  const remaining = primary?.remainingPercent ?? null
  const tone = getCodexUsageTone(remaining)
  const label = describeCodexUsagePill(snapshot)
  const warmingUp = isCodexUsageWarmingUp(snapshot)
  const unavailableReason =
    snapshot?.status === 'unavailable' ? snapshot.reason : null

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        // A press on the pill opens the panel, never closes it: the pointer
        // that rested on it has opened it already (MAR-3616).
        if (!next && details.reason === 'trigger-press') return
        setOpen(next)
      }}
    >
      <span onPointerEnter={openPanel} onPointerLeave={closePanelSoon}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              aria-label={label.ariaLabel}
              onClick={(event) => {
                event.stopPropagation()
                openPanel()
              }}
              size="sm"
              className={cn(
                'shrink-0 gap-2 font-semibold',
                usagePillTone[tone],
              )}
            />
          }
        >
          <Meter
            shape="ring"
            value={remaining ?? 0}
            label="Codex quota remaining"
            tone={tone}
            // Asking: the ring beats, and stands still under reduced motion.
            className={
              isLoading || warmingUp
                ? 'animate-pulse motion-reduce:animate-none'
                : undefined
            }
          />
          <span>Codex {label.text}</span>
        </PopoverTrigger>
      </span>
      <PopoverContent
        aria-label="Codex usage"
        side="top"
        className="w-80 space-y-3 p-3"
        onPointerEnter={openPanel}
        onPointerLeave={closePanelSoon}
        initialFocus={false}
      >
        {renderUsageHeading({
          title: 'Codex usage',
          detail: (
            <>
              checked {formatCheckedAt(snapshot?.lastCheckedAt)}
              {snapshot?.status === 'available' && snapshot.stale
                ? ' (stale)'
                : ''}
            </>
          ),
          action: (
            <IconButton
              label="Refresh Codex usage"
              variant="ghost"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRefresh()
              }}
              size="xs"
            >
              {isLoading ? (
                <Spinner size="sm" />
              ) : (
                <RefreshCw aria-hidden className="size-3.5" />
              )}
            </IconButton>
          ),
        })}

        {snapshot?.status === 'available' ? (
          <div className="space-y-2">
            <CodexUsageQuotaRow
              label="5 hour"
              remaining={primary?.remainingPercent ?? null}
              reset={primary?.resetsAt ?? null}
            />
            <CodexUsageQuotaRow
              label="Weekly"
              remaining={weekly?.remainingPercent ?? null}
              reset={weekly?.resetsAt ?? null}
            />
            {snapshot.credits ? (
              <div
                className={cn(usageSection, 'flex items-center gap-2 text-xs')}
              >
                <span className="w-18 shrink-0 font-medium text-ink">
                  Credits
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-muted">
                  {snapshot.credits.unlimited
                    ? 'Unlimited'
                    : snapshot.credits.hasCredits
                      ? 'Available'
                      : 'No credits remaining'}
                </span>
                <span className="w-10 shrink-0 text-right font-medium text-ink">
                  {snapshot.credits.unlimited
                    ? 'Any'
                    : (snapshot.credits.balance ?? '0')}
                </span>
              </div>
            ) : null}
          </div>
        ) : (
          renderUsageNote(unavailableReason ?? 'Codex usage is unavailable.')
        )}

        <div
          className={cn(
            usageSection,
            'flex items-center justify-between text-2xs text-ink-muted',
          )}
        >
          <span>Refreshes quietly while visible</span>
          <Button
            variant="link"
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
