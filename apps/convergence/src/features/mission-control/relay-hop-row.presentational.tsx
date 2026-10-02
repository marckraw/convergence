import type { FC } from 'react'
import { ArrowRight, ChevronRight } from 'lucide-react'
import { cn, IconButton, StatusDot, toneInk, Tooltip } from '@convergence/ui'
import { RELAY_HOP_TONE } from './hop-tone.styles'
import type { RelayHopLine } from './relay-hop.pure'

interface RelayHopRowProps {
  line: RelayHopLine
  expanded: boolean
  onToggle: () => void
}

/**
 * One line of the ledger.
 *
 * Errors say what went wrong right here rather than behind a click -- a
 * failure the user has to expand to read is a failure they will not read. The
 * payload is the only thing folded away, because it is long and rarely the
 * question being asked.
 */
export const RelayHopRow: FC<RelayHopRowProps> = ({
  line,
  expanded,
  onToggle,
}) => {
  const alarm = line.tone === 'alarm'
  const canExpand = line.payloadPreview !== null
  const tone = RELAY_HOP_TONE[line.tone]

  return (
    <li
      data-relay-hop
      className={cn(
        'rounded px-1.5 py-1',
        alarm && 'bg-danger-soft ring-1 ring-danger-line',
      )}
    >
      <div className="flex items-center gap-1.5 text-2xs leading-tight">
        <StatusDot tone={tone} size="sm" />
        <span className="shrink-0 tabular-nums text-ink-muted">
          {line.timeLabel}
        </span>
        <span className="truncate text-ink">{line.sourceName}</span>
        {line.targetName ? (
          <>
            <ArrowRight
              aria-hidden
              className="size-3 shrink-0 text-ink-muted"
            />
            <span className="truncate text-ink">{line.targetName}</span>
          </>
        ) : null}
        {/* The route and the round sit before the outcome, in the order the
            beat happened: the message declared a baton, the loop was N rounds
            deep, and then the wire did something about it. Both are absent on
            every row written before batons existed, which is the honest answer
            rather than a zero nobody recorded. */}
        {line.batonLabel ? (
          <span className="ml-auto shrink-0 text-ink-muted">
            {line.batonLabel}
          </span>
        ) : null}
        {line.roundLabel ? (
          <span
            className={cn(
              'shrink-0 tabular-nums text-ink-muted',
              line.batonLabel ? '' : 'ml-auto',
            )}
          >
            {line.roundLabel}
          </span>
        ) : null}
        <Tooltip
          label={
            line.rawOutcome
              ? `Recorded by another version as "${line.rawOutcome}"`
              : undefined
          }
        >
          <span
            className={cn(
              'shrink-0 font-medium',
              !line.batonLabel && !line.roundLabel && 'ml-auto',
              toneInk[tone],
            )}
          >
            {line.outcomeLabel}
          </span>
        </Tooltip>

        {canExpand ? (
          <IconButton
            label={
              expanded ? 'Hide the message carried' : 'Show the message carried'
            }
            type="button"
            variant="quiet"
            aria-expanded={expanded}
            onClick={onToggle}
            size="xs"
            className="shrink-0"
          >
            {/* One chevron that turns (MC-31), as every disclosure does. */}
            <ChevronRight
              className={cn(
                'size-3 transition-transform',
                expanded && 'rotate-90',
              )}
            />
          </IconButton>
        ) : null}
      </div>

      {/* The "why" line takes the row's own tone. The ledger explains every
          skip in words, and once the loop law started writing quiet rows a
          permanently red explanation would have made a wire behaving
          correctly look like a wire that broke. */}
      {line.error ? (
        <p
          className={cn(
            'mt-0.5 pl-3 text-2xs leading-snug',
            alarm ? toneInk.danger : 'text-ink-muted',
          )}
        >
          {line.error}
        </p>
      ) : null}

      {expanded && line.payloadPreview ? (
        <p className="mt-1 rounded bg-surface-sunken px-2 py-1 text-2xs leading-snug text-ink-muted">
          {line.payloadPreview}
        </p>
      ) : null}
    </li>
  )
}
