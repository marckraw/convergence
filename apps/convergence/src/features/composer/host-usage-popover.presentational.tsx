import {
  DescriptionItem,
  DescriptionList,
  MetaLine,
  Meter,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusPillButton,
  Timestamp,
} from '@convergence/ui'
import type { HostUsagePillView } from './host-usage-pill.pure'
import {
  renderUsageHeading,
  renderUsageNote,
  UsageMeterRow,
} from './usage-popover.presentational'
import { usageSection } from './usage-pill.styles'

interface HostUsagePopoverProps {
  view: HostUsagePillView
  /** Whether the panel is showing: its container holds it. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A pointer rested on the pill or the panel, or the pill was pressed. */
  onOpenPanel: () => void
  /** The pointer left: the container closes it a moment later. */
  onClosePanelSoon: () => void
}

/** A moment the host gave, or "unknown" when it is not one (CONV-22). */
function when(value: string | null, format: 'clock' | 'datetime') {
  if (!value || Number.isNaN(new Date(value).getTime())) return null
  return <Timestamp date={value} format={format} />
}

/**
 * A remote host's usage beside its provider (MAR-4272): the Codex pill's
 * sibling, for an account this app does not hold. It has no refresh and no
 * Settings link, because neither reaches the host: the reading is the host's,
 * and it moves when the catalogue is asked again.
 */
export function HostUsagePopover({
  view,
  open,
  onOpenChange,
  onOpenPanel: openPanel,
  onClosePanelSoon: closePanelSoon,
}: HostUsagePopoverProps) {
  const observed = when(view.observedAt, 'clock')
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
        <PopoverTrigger
          render={
            <StatusPillButton
              size="sm"
              tone={view.tone}
              leading={
                <Meter
                  shape="ring"
                  value={view.remainingPercent ?? 0}
                  label={`${view.title} usage limit remaining`}
                  tone={view.tone}
                />
              }
              type="button"
              aria-label={view.ariaLabel}
              onClick={(event) => {
                event.stopPropagation()
                openPanel()
              }}
              className="shrink-0 font-semibold"
            />
          }
        >
          {view.text}
        </PopoverTrigger>
      </span>
      <PopoverContent
        aria-label={`${view.title} usage`}
        side="top"
        className="w-80 space-y-3 p-3"
        onPointerEnter={openPanel}
        onPointerLeave={closePanelSoon}
        initialFocus={false}
      >
        {renderUsageHeading({
          title: `${view.title} usage`,
          detail: (
            <>
              {view.sourceLabel}
              {observed ? <> at {observed}</> : null}
            </>
          ),
        })}

        {view.verdict === 'limited'
          ? renderUsageNote(
              'The host reports this account as limited: it refuses turns until a window starts again.',
            )
          : null}

        {view.windows.length > 0 ? (
          <div className="space-y-2">
            {view.windows.map((window) => {
              const resets = when(window.resetsAt, 'datetime')
              const value = `${Math.round(window.remainingPercent)}%`
              return (
                <UsageMeterRow
                  key={window.id}
                  label={window.label}
                  detail={
                    resets ? <>Resets {resets}</> : 'Reset time unavailable'
                  }
                  value={window.remainingPercent}
                  valueLabel={value}
                  tone={window.tone}
                  meterLabel={`${window.label} usage limit remaining`}
                />
              )
            })}
          </div>
        ) : view.verdict === 'limited' ? null : (
          renderUsageNote('No usage limit in force for this model.')
        )}

        {view.credits ? (
          // A term and its value (CONV-24): what is left, then how much.
          <DescriptionList
            layout="inline"
            density="compact"
            className={usageSection}
          >
            <DescriptionItem term="Credits">
              <MetaLine>
                {view.credits.text}
                {view.credits.balance}
              </MetaLine>
            </DescriptionItem>
          </DescriptionList>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
