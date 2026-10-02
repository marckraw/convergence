import type { SessionContextWindow } from '@/entities/session'
import type { ContextDrillActionState } from '@/entities/context-drill'
import {
  Button,
  cn,
  DescriptionItem,
  DescriptionList,
  MetaLine,
  Popover,
  PopoverContent,
  PopoverTrigger,
  StatusDot,
  StatusPillButton,
} from '@convergence/ui'
import type { ContextCompactionActionState } from './context-compaction.pure'
import {
  contextWindowLabel,
  formatFullTokens,
  type ContextWindowTone,
} from './context-window-tone.pure'
import {
  renderUsageHeading,
  renderUsageNote,
  UsageMeterRow,
} from './usage-popover.presentational'
import { contextDotHalo, usageSection } from './usage-pill.styles'

/** A quiet line under an action: why it waits, how it went. */
const usageFootnote = 'text-2xs leading-relaxed text-ink-muted'

interface ContextWindowPopoverProps {
  contextWindow: SessionContextWindow | null | undefined
  /** The dot's tone (R1), from the window and the alert threshold. */
  tone: ContextWindowTone
  /** The line that names the threshold once it is crossed, or null below it. */
  alertLine: string | null
  compaction: ContextCompactionActionState
  /** Availability is checked against the installed provider when it runs. */
  compactionCheckedAtRun: boolean
  /** A compaction asked for here is under way, or the session is compacting. */
  compacting: boolean
  /** Compact waits while a drill runs. */
  drillRunning: boolean
  /** How the last compaction asked for here went. */
  actionMessage: { tone: 'success' | 'error'; text: string } | null
  drill: ContextDrillActionState
  /** Why the backend refused a Cancel. */
  cancelRefusal: string | null
  onCompact: () => void
  onRunDrill: () => void
  onCancelDrill: () => void
  /** Whether the panel is showing: its container holds it. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A pointer rested on the dot or the panel, or the dot was pressed. */
  onOpenPanel: () => void
  /** The pointer left: the container closes it a moment later. */
  onClosePanelSoon: () => void
}

/**
 * The context dot and its panel (CONV-26, CONV-30): how much room the
 * conversation has left, Compact, and the drill. Props in, markup out; the
 * hover timing, the compaction's progress and the drill's store are its
 * container's.
 */
export function ContextWindowPopover({
  contextWindow,
  tone,
  alertLine,
  compaction,
  compactionCheckedAtRun,
  compacting,
  drillRunning,
  actionMessage,
  drill,
  cancelRefusal,
  onCompact,
  onRunDrill,
  onCancelDrill,
  open,
  onOpenChange,
  onOpenPanel: openPanel,
  onClosePanelSoon: closePanelSoon,
}: ContextWindowPopoverProps) {
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
        {/* A state you press to open what it is about: the round pill of the
            row's size, in its tone (DS-9), named by its label (R2). */}
        <PopoverTrigger
          render={
            <StatusPillButton
              size="sm"
              tone={tone}
              label={contextWindowLabel(contextWindow)}
              leading={
                <StatusDot
                  tone={tone}
                  size="lg"
                  className={contextDotHalo[tone]}
                />
              }
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                openPanel()
              }}
              className="shrink-0"
            />
          }
        />
      </span>
      <PopoverContent
        aria-label="Context window"
        side="top"
        className="w-80 space-y-3 p-3"
        onPointerEnter={openPanel}
        onPointerLeave={closePanelSoon}
        initialFocus={false}
      >
        {renderUsageHeading({
          title: 'Context window',
          detail:
            'Current conversation capacity, separate from provider usage limits.',
        })}

        {!contextWindow ? (
          renderUsageNote(
            'Context usage has not been reported for this session yet.',
          )
        ) : contextWindow.availability === 'unavailable' ? (
          renderUsageNote(contextWindow.reason)
        ) : (
          <div className="space-y-2">
            <UsageMeterRow
              label="Remaining"
              value={contextWindow.remainingPercentage}
              valueLabel={`${contextWindow.remainingPercentage}%`}
              tone={tone}
              meterLabel="Context window remaining"
            />
            <div className={usageSection}>
              <DescriptionList layout="inline" className="gap-1.5">
                <DescriptionItem term="Used">
                  {/* Its facts on a MetaLine (CONV-23). */}
                  <MetaLine>
                    {`${contextWindow.usedPercentage}%`}
                    {`${formatFullTokens(contextWindow.usedTokens)} tokens`}
                  </MetaLine>
                </DescriptionItem>
                <DescriptionItem term="Window">
                  {formatFullTokens(contextWindow.windowTokens)} tokens
                </DescriptionItem>
                <DescriptionItem term="Source">
                  {contextWindow.source === 'provider'
                    ? 'Provider-reported'
                    : 'Estimated'}
                </DescriptionItem>
              </DescriptionList>
            </div>
            {alertLine ? (
              <p className="text-2xs leading-relaxed text-warning-ink">
                {alertLine}
              </p>
            ) : null}
          </div>
        )}

        {compaction.visible ? (
          <div className={cn(usageSection, 'space-y-2 pt-3')}>
            <Button
              type="button"
              disabled={!compaction.enabled || compacting || drillRunning}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onCompact()
              }}
              className="w-full"
            >
              {compacting ? 'Compacting context…' : 'Compact context'}
            </Button>
            {!compaction.enabled && compaction.reason ? (
              <p className={usageFootnote}>{compaction.reason}</p>
            ) : compactionCheckedAtRun ? (
              <p className={usageFootnote}>
                Availability is verified against the installed provider when you
                run it.
              </p>
            ) : null}
            {actionMessage ? (
              <p
                className={cn(
                  usageFootnote,
                  actionMessage.tone === 'success'
                    ? 'text-success-ink'
                    : 'text-danger-ink',
                )}
              >
                {actionMessage.text}
              </p>
            ) : null}
          </div>
        ) : null}

        {drill.visible ? (
          <div className={cn(usageSection, 'space-y-2 pt-3')}>
            <Button
              type="button"
              variant="tonal"
              disabled={!drill.enabled}
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRunDrill()
              }}
              className="w-full"
            >
              {drill.label}
            </Button>
            {drill.cancel.visible ? (
              <Button
                type="button"
                variant="ghost"
                disabled={!drill.cancel.enabled}
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCancelDrill()
                }}
                className="w-full"
              >
                Cancel
              </Button>
            ) : null}
            {drill.cancel.visible && drill.cancel.reason ? (
              <p className={usageFootnote}>{drill.cancel.reason}</p>
            ) : !drill.enabled && drill.reason ? (
              <p className={usageFootnote}>{drill.reason}</p>
            ) : null}
            {cancelRefusal ? (
              <p className={cn(usageFootnote, 'text-danger-ink')}>
                {cancelRefusal}
              </p>
            ) : null}
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
