import type { ProviderQuotaSnapshot } from '@/entities/provider-quota'
import {
  Button,
  cn,
  DescriptionItem,
  DescriptionList,
  IconButton,
  MetaLine,
  Meter,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  StatusPillButton,
  Timestamp,
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
import { usageSection } from './usage-pill.styles'

interface CodexUsagePopoverProps {
  snapshot: ProviderQuotaSnapshot | null
  isLoading: boolean
  onRefresh: () => void
  onOpenSettings: () => void
  /** Whether the panel is showing: its container holds it. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A pointer rested on the pill or the panel, or the pill was pressed. */
  onOpenPanel: () => void
  /** The pointer left: the container closes it a moment later. */
  onClosePanelSoon: () => void
}

/** When the usage was read: a Timestamp, the whole moment in its tooltip (CONV-22). */
function checkedAt(value: string | null | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return 'not checked'
  return <Timestamp date={value} format="clock" />
}

/**
 * The Codex quota pill and its panel (CONV-26, CONV-30): props in, markup out.
 * Whether it is open, and the pointer's timing, are its container's.
 */
export function CodexUsagePopover({
  snapshot,
  isLoading,
  onRefresh,
  onOpenSettings,
  open,
  onOpenChange,
  onOpenPanel: openPanel,
  onClosePanelSoon: closePanelSoon,
}: CodexUsagePopoverProps) {
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
        onOpenChange(next)
      }}
    >
      <span onPointerEnter={openPanel} onPointerLeave={closePanelSoon}>
        {/* A state you press to open what it is about: the pill of the
            row's size, in its tone (DS-9). */}
        <PopoverTrigger
          render={
            <StatusPillButton
              size="sm"
              tone={tone}
              leading={
                <Meter
                  shape="ring"
                  value={remaining ?? 0}
                  label="Codex quota remaining"
                  tone={tone}
                  // Asking: the ring beats, and stands still under reduced
                  // motion.
                  className={
                    isLoading || warmingUp
                      ? 'animate-pulse motion-reduce:animate-none'
                      : undefined
                  }
                />
              }
              type="button"
              aria-label={label.ariaLabel}
              onClick={(event) => {
                event.stopPropagation()
                openPanel()
              }}
              className="shrink-0 font-semibold"
            />
          }
        >
          Codex {label.text}
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
              checked {checkedAt(snapshot?.lastCheckedAt)}
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
              // A term and its value (CONV-24): what is left, then how much.
              <DescriptionList
                layout="inline"
                density="compact"
                className={usageSection}
              >
                <DescriptionItem term="Credits">
                  <MetaLine>
                    {snapshot.credits.unlimited
                      ? 'Unlimited'
                      : snapshot.credits.hasCredits
                        ? 'Available'
                        : 'No credits remaining'}
                    {snapshot.credits.unlimited
                      ? 'Any'
                      : (snapshot.credits.balance ?? '0')}
                  </MetaLine>
                </DescriptionItem>
              </DescriptionList>
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
            Settings…
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
