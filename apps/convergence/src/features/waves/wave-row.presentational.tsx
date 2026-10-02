import { ExternalLink } from 'lucide-react'
import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { cn, focusRing } from '@convergence/ui'
import {
  waveRowKey,
  waveRowMetaWords,
  waveRowPullRequest,
  type WaveRow,
} from './wave-sections.pure'
import { LoomIssueCard } from './loom-issue-card.presentational'
import { WAVE_ROW_ACTION_CLASS, WAVE_ROW_META_CLASS } from './wave-panel.styles'

interface WaveRowViewProps {
  appearance?: 'loom'
  layout?: 'list' | 'grid'
  row: WaveRow
  /** Why the row cannot open its seat, or null when it can. */
  inertReason: string | null
  onOpen: (entry: WorkLedgerEntry) => void
}

/**
 * One issue on the panel (R2): identifier, title, crew (when several are
 * bound), seat, state, PR, the human action, the `blocked` label and a host
 * outage marker -- the ledger's facts, nothing invented. A row without a
 * reachable destination says why it is inert.
 *
 * Drawn as a LoomIssueCard (MC-35), the head an issue outside the loop wears
 * too; this row adds the ledger's facts under the head and its asks after the
 * chips. A row that opens is a Card whose title is its door (MC-26), and the
 * PR link stays a link of its own beside it, never inside a button.
 */
export const WaveRowView: FC<WaveRowViewProps> = ({
  appearance,
  layout = 'list',
  row,
  inertReason,
  onOpen,
}) => {
  const { entry, action, hostMarker } = row
  const pr = waveRowPullRequest(row)
  const loom = appearance === 'loom'
  return (
    <LoomIssueCard
      data-wave-row={waveRowKey(entry)}
      plain={!loom}
      className={loom && layout === 'list' ? 'mb-2' : undefined}
      identifier={entry.issueIdentifier}
      title={entry.issueTitle}
      trackerStatus={entry.trackerStatus}
      labels={entry.fact.labels}
      done={entry.state === 'done'}
      door={
        inertReason === null
          ? { kind: 'open', onOpen: () => onOpen(entry) }
          : { kind: 'inert' }
      }
      meta={
        <span
          className={cn(
            WAVE_ROW_META_CLASS,
            loom && 'max-w-full whitespace-normal break-words',
          )}
        >
          {waveRowMetaWords(row).join(' · ')}
          {pr ? (
            <>
              {' · '}
              {inertReason === null ? (
                // raw-element: the link sits inline in the meta line's sentence and stays its own tab stop above the card's stretched door (TextLink's box would break the sentence)
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${pr.label}, opens on GitHub`}
                  className={cn(
                    'relative z-10 inline-flex items-center gap-1 rounded-sm underline-offset-2 hover:underline',
                    focusRing,
                  )}
                  onClick={(event) => event.stopPropagation()}
                >
                  {pr.label}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              ) : (
                pr.label
              )}
            </>
          ) : null}
          {entry.fact.merged
            ? ` · merged ${entry.fact.merged.headSha.slice(0, 7)}`
            : null}
        </span>
      }
    >
      {action ? <span className={WAVE_ROW_ACTION_CLASS}>{action}</span> : null}
      {/* The label itself, beside the action it caused (MAR-3138 R4): the
          action says what to do, this says why it is being asked. */}
      {entry.blocked ? (
        <span className={WAVE_ROW_ACTION_CLASS}>blocked</span>
      ) : null}
      {hostMarker ? (
        <span className={WAVE_ROW_ACTION_CLASS}>{hostMarker}</span>
      ) : null}
      {inertReason ? (
        <span className={WAVE_ROW_META_CLASS}>{inertReason}</span>
      ) : null}
    </LoomIssueCard>
  )
}
