import { CheckCircle2 } from 'lucide-react'
import type { FC, ReactNode } from 'react'
import {
  Badge,
  Card,
  CardAction,
  cn,
  focusRing,
  Tooltip,
} from '@convergence/ui'
import {
  LOOM_CARD_HEAD_CLASS,
  LOOM_ROW_CARD_CLASS,
  WAVE_ROW_CLASS,
  WAVE_ROW_OPENABLE_CLASS,
  WAVE_ROW_PLAIN_CLASS,
} from './wave-panel.styles'

/** How an issue card opens, if it does. */
export type LoomIssueCardDoor =
  /**
   * In place: the title is the card's door (a CardAction whose hit area
   * covers the card), and a press anywhere on the card reaches `onOpen`.
   */
  | { kind: 'open'; onOpen: () => void }
  /** Out of the app: the whole card is the link, to the issue in Linear. */
  | { kind: 'link'; href: string }
  /** Nowhere: no door, and the card says it is disabled. */
  | { kind: 'inert' }

export type LoomIssueCardProps = {
  identifier: string
  title: string
  /** The tracker's word for the issue's status; empty when it has none. */
  trackerStatus: string
  /** The issue's labels, in the tracker's order. */
  labels?: readonly string[]
  /** Done: a check before the identifier, and the status chip in success. */
  done?: boolean
  door: LoomIssueCardDoor
  /**
   * The wave panel's plain list row instead of Loom's card: no edge, no fill,
   * no check and no chips, and the title in the row's own type.
   */
  plain?: boolean
  /** Spacing from what is around it (a list's gap below each card). */
  className?: string
  /** What the card says between its head and its chips: the row's facts. */
  meta?: ReactNode
  /** What it says after its chips: what it asks, and its markers. */
  children?: ReactNode
} & {
  /** The hooks a sheet, and its tests, find a card by. */
  [attribute: `data-${string}`]: string | undefined
}

/**
 * One issue as Loom draws it (MC-35): the identifier, the title, and the
 * tracker's status and labels as chips -- the same head for an issue in the
 * loop (the wave row) and one outside it (the outside row), so the two cannot
 * drift.
 *
 * A card that opens in place is a Card with a stretched action (MC-26): its
 * title is the button, and its hit area covers the card, so the card answers
 * the pointer anywhere and rings as a whole -- while a link inside it (the
 * wave row's PR) stays a link of its own, raised above that hit area, never
 * inside a button. A card that leaves the app is a Card drawn as an `<a>`.
 */
export const LoomIssueCard: FC<LoomIssueCardProps> = ({
  identifier,
  title,
  trackerStatus,
  labels,
  done = false,
  door,
  plain = false,
  className,
  meta,
  children,
  ...hooks
}) => {
  const titleClass = cn(
    'line-clamp-2 min-w-0',
    !plain && 'w-full text-xs font-medium leading-relaxed',
  )
  const shellClass = cn(
    WAVE_ROW_CLASS,
    door.kind !== 'inert' && WAVE_ROW_OPENABLE_CLASS,
    className,
    plain ? WAVE_ROW_PLAIN_CLASS : LOOM_ROW_CARD_CLASS,
    door.kind === 'link' && focusRing,
  )
  const body = (
    <>
      <span className={cn(LOOM_CARD_HEAD_CLASS, !plain && 'flex-wrap')}>
        {!plain && done ? (
          <CheckCircle2
            aria-hidden
            className="size-3.5 shrink-0 self-center text-success-ink"
          />
        ) : null}
        {/* One unbreakable token (MAR-3155 R5): at the old fixed width
            `MAR-3085` wrapped after the dash, which is the one thing a card
            exists to say. It never shrinks; the title takes what is left. */}
        <span className="shrink-0 whitespace-nowrap font-mono text-2xs text-ink-muted">
          {identifier}
        </span>
        {/* Two lines rather than one cut short, and the whole title one hover
            away in our Tooltip (R2) -- `min-w-0` so the flex child may
            actually be narrower than its text. The title is the card's door
            when the card opens in place. */}
        <Tooltip label={title} when="truncated">
          {door.kind === 'open' ? (
            <CardAction
              // The door says which issue: its identifier and its title.
              aria-label={`${identifier} ${title}`}
              className={titleClass}
            >
              {title}
            </CardAction>
          ) : (
            <span className={titleClass}>{title}</span>
          )}
        </Tooltip>
      </span>
      {meta}
      {/* Read-only labels, never controls (R6): the kit's outline Badge,
          not a tint, since a wash on Loom's paper sank the words (MC-6). */}
      {plain ? null : (
        <span className="flex max-w-full flex-wrap gap-1.5">
          <Badge
            outline
            tone={done ? 'success' : 'neutral'}
            data-loom-chip="status"
          >
            Linear: {trackerStatus || 'not seen'}
          </Badge>
          {labels?.map((label) => (
            <Badge key={label} outline data-loom-chip="label">
              {label}
            </Badge>
          ))}
        </span>
      )}
      {children}
    </>
  )

  if (door.kind === 'inert') {
    return (
      <div {...hooks} aria-disabled="true" className={shellClass}>
        {body}
      </div>
    )
  }
  return door.kind === 'open' ? (
    // A card, not a button: it may hold a link of its own (MAR-3361). Its
    // door is the title's CardAction, whose hit area covers the card; a
    // press anywhere on it, or Enter and Space on the door, reaches this one
    // handler, and a link inside stops its own click before it gets here.
    <Card
      {...hooks}
      interactive
      padding="none"
      className={shellClass}
      onClick={door.onOpen}
    >
      {body}
    </Card>
  ) : (
    <Card
      {...hooks}
      interactive
      padding="none"
      render={<a href={door.href} target="_blank" rel="noreferrer" />}
      className={shellClass}
    >
      {body}
    </Card>
  )
}
