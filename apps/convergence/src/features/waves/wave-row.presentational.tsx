import { CheckCircle2, ExternalLink } from 'lucide-react'
import type { FC } from 'react'
import type { WorkLedgerEntry } from '@/entities/work-ledger'
import { Card, CardAction, cn, focusRing, Tooltip } from '@convergence/ui'
import {
  waveRowKey,
  waveRowMetaWords,
  waveRowPullRequest,
  type WaveRow,
} from './wave-sections.pure'
import {
  LOOM_CARD_HEAD_CLASS,
  LOOM_CHIP_CLASS,
  LOOM_ROW_CARD_CLASS,
  WAVE_ROW_ACTION_CLASS,
  WAVE_ROW_CLASS,
  WAVE_ROW_META_CLASS,
  WAVE_ROW_OPENABLE_CLASS,
  WAVE_ROW_PLAIN_CLASS,
} from './wave-panel.styles'

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
 * A row that opens is a Card with a stretched action (MC-26): its title is
 * the button, and its hit area covers the card, so the card answers the
 * pointer anywhere and rings as a whole -- while the PR link stays a link of
 * its own beside it, raised above that hit area, never inside a button.
 */
export const WaveRowView: FC<WaveRowViewProps> = ({
  appearance,
  layout = 'list',
  row,
  inertReason,
  onOpen,
}) => {
  const { entry, action, hostMarker } = row
  const key = waveRowKey(entry)
  const pr = waveRowPullRequest(row)
  const loom = appearance === 'loom'
  const openable = inertReason === null
  const cardClass = loom
    ? cn(layout === 'list' && 'mb-2', LOOM_ROW_CARD_CLASS)
    : WAVE_ROW_PLAIN_CLASS
  const body = (
    <>
      <span className={cn(LOOM_CARD_HEAD_CLASS, loom && 'flex-wrap')}>
        {loom && entry.state === 'done' ? (
          <CheckCircle2
            aria-hidden
            className="size-3.5 shrink-0 self-center text-success-ink"
          />
        ) : null}
        {/* One unbreakable token (MAR-3155 R5): at the old fixed width
            `MAR-3085` wrapped after the dash, which is the one thing a row
            exists to say. It never shrinks; the title takes what is left. */}
        <span className="shrink-0 whitespace-nowrap font-mono text-2xs text-ink-muted">
          {entry.issueIdentifier}
        </span>
        {/* Two lines rather than one cut short, and the whole title one hover
            away in our Tooltip (R2) -- `min-w-0` so the flex child may
            actually be narrower than its text. The title is the card's door
            when the row opens. */}
        <Tooltip label={entry.issueTitle} when="truncated">
          {openable ? (
            <CardAction
              // The door says which issue: its identifier and its title.
              aria-label={`${entry.issueIdentifier} ${entry.issueTitle}`}
              className={cn(
                'line-clamp-2 min-w-0',
                loom && 'w-full text-xs font-medium leading-relaxed',
              )}
            >
              {entry.issueTitle}
            </CardAction>
          ) : (
            <span
              className={cn(
                'line-clamp-2 min-w-0',
                loom && 'w-full text-xs font-medium leading-relaxed',
              )}
            >
              {entry.issueTitle}
            </span>
          )}
        </Tooltip>
      </span>
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
      {loom ? (
        <span className="flex max-w-full flex-wrap gap-1.5">
          <span
            data-loom-chip="status"
            className={cn(
              LOOM_CHIP_CLASS,
              entry.state === 'done' && 'text-success-ink',
            )}
          >
            Linear: {entry.trackerStatus || 'not seen'}
          </span>
          {entry.fact.labels?.map((label) => (
            <span
              key={label}
              data-loom-chip="label"
              className={LOOM_CHIP_CLASS}
            >
              {label}
            </span>
          ))}
        </span>
      ) : null}
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
    </>
  )

  return openable ? (
    // A card, not a button: it holds a link of its own (MAR-3361). Its door
    // is the title's CardAction, whose hit area covers the card; a press
    // anywhere on it, or Enter and Space on the door, reaches this one
    // handler, and the PR link stops its own click before it gets here.
    <Card
      interactive
      padding="none"
      data-wave-row={key}
      className={cn(WAVE_ROW_CLASS, WAVE_ROW_OPENABLE_CLASS, cardClass)}
      onClick={() => onOpen(entry)}
    >
      {body}
    </Card>
  ) : (
    <div
      data-wave-row={key}
      aria-disabled="true"
      className={cn(WAVE_ROW_CLASS, cardClass)}
    >
      {body}
    </div>
  )
}
