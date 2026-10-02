import type { ComponentProps, FC, ReactNode } from 'react'
import { Cable, Radio } from 'lucide-react'
import {
  formatSessionAttentionLabel,
  SessionStateBadge,
} from '@/entities/session'
import { parallelWorkStatus } from '@/shared/lib/parallel-work.pure'
import { ProviderIcon } from '@/shared/ui/provider-icon.presentational'
import { ProviderModel } from '@/shared/ui/provider-model.presentational'
import {
  Card,
  CardAction,
  cn,
  Spinner,
  StatusDot,
  Toggle,
  Tooltip,
} from '@convergence/ui'
import { CrewMark } from './crew-mark.presentational'
import type { SessionCard } from './mission-control.types'
import type { SessionWireHint } from './relay-hop.pure'
import { buildCardBreatheStyle } from './session-card-breathe.pure'
import {
  formatSessionCardState,
  readSessionCardSignal,
} from './session-card-state.pure'
import {
  ACTIVITY_TEXT_STYLES,
  CARD_ATTENTION_TONE,
  CARD_HAIL_OPEN_CLASS,
  CARD_OPEN_CLASS,
  CARD_TONE_FRAME,
  CARD_TONE_WASH,
  STATUS_DOT_TONE,
} from './session-card.styles'
import { CREW_ROW_CLASS } from './session-filter.styles'

/** grid: the Flat room's card. node: the canvas's compact face of the same card. */
export type SessionCardDensity = 'grid' | 'node'

type SessionCardViewProps = Omit<
  ComponentProps<'div'>,
  'className' | 'children' | 'onClick'
> & {
  card: SessionCard
  density?: SessionCardDensity
  /**
   * True when this is the conversation open in the main view, so the room
   * shows which card is yours (MAR-3321). Independent of `hailOpen`.
   */
  open?: boolean
  /** True while this card's Hail is the one open, so the room shows which. */
  hailOpen?: boolean
  /** The canvas's lit source while a connection is being picked. */
  picked?: boolean
  /** What the body does, for a screen reader: "Open <name>" unless told otherwise. */
  actionLabel?: string
  /** The crew gesture, composed above so this file stays render-only. */
  crewAction?: ReactNode
  /** Relays touching this session, or null when nothing is wired to it. */
  wireHint?: SessionWireHint | null
  onOpen: (card: SessionCard) => void
  /** The grid card's Hail; the canvas node has none. */
  onHail?: (card: SessionCard) => void
  /** The canvas's ports, drawn on the card's edges after its body. */
  children?: ReactNode
}

/**
 * A session as Mission Control draws it, in the Flat grid and on the canvas
 * (MC-4): one card, so one session reads the same in every view. The corner
 * says what it needs or what it is doing, read once by
 * `readSessionCardSignal` (the host guard first); attention owns the frame in
 * its R1 tone; the body is the card's one door, its name a stretched action
 * that opens the conversation (or picks it, on an armed canvas).
 *
 * The node drops the Hail, the crews and the footer: the canvas is for reading
 * how sessions are wired to each other, and the card grid is one click away
 * for operating them.
 */
export const SessionCardView: FC<SessionCardViewProps> = ({
  card,
  density = 'grid',
  open = false,
  hailOpen = false,
  picked = false,
  actionLabel,
  crewAction,
  wireHint,
  onOpen,
  onHail,
  children,
  style,
  ...rest
}) => {
  const { session } = card
  const signal = readSessionCardSignal(card)
  const grid = density === 'grid'
  const tone = CARD_ATTENTION_TONE[session.attention]
  const attention = formatSessionAttentionLabel(session)
  const activity = signal.hostUnreachable
    ? formatSessionCardState('host-unreachable')
    : (parallelWorkStatus(session) ?? card.activityLabel)

  return (
    <Card
      {...rest}
      // The room measures card positions to open a Hail under the right row.
      data-session-card={grid ? '' : undefined}
      data-density={density}
      // The conversation on screen, in the semantics a nav marks its current
      // item with: the selected fill, and the ring below.
      selected={open}
      // A working card breathes in its crew's colour, so a glance across the
      // room says who is busy. The stylesheet owns the animation; the card
      // hands it the colour and the knobs. Absent entirely when not working.
      data-breathing={grid && signal.running ? 'true' : undefined}
      style={{
        ...(grid ? buildCardBreatheStyle(signal.running, card.crews) : {}),
        ...style,
      }}
      surface={grid ? 'inset' : 'raised'}
      padding="none"
      className={cn(
        'group flex flex-col',
        'border-hairline',
        !grid && 'overflow-hidden',
        open && CARD_OPEN_CLASS,
        // After the open mark on purpose: attention owns the frame, its tint
        // included, so the open card's fill yields to it.
        tone && (grid ? CARD_TONE_FRAME[tone] : CARD_TONE_WASH[tone]),
        hailOpen && CARD_HAIL_OPEN_CLASS,
        picked && '!border-info-solid ring-1 ring-info-line',
      )}
    >
      <div
        className={cn(
          'relative flex flex-col text-left',
          grid ? 'gap-2 px-3 pt-3 pb-2' : 'flex-1 gap-1.5 px-3 py-2.5',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <CardAction
            aria-label={actionLabel ?? `Open ${session.name}`}
            onClick={() => onOpen(card)}
            className="min-w-0 truncate text-sm font-medium"
          >
            {session.name}
          </CardAction>
          {signal.needsYou ? (
            <Tooltip label={grid ? undefined : attention}>
              <span className="relative flex shrink-0 items-center gap-1 text-2xs text-ink-muted">
                <SessionStateBadge session={session} />
                {grid ? attention : null}
              </span>
            </Tooltip>
          ) : (
            <StatusDot
              tone={
                signal.hostUnreachable
                  ? 'warning'
                  : STATUS_DOT_TONE[session.status]
              }
              pulse={signal.running}
              className="mt-1"
            />
          )}
        </div>

        {grid ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xs text-ink-muted">
            <span className="truncate font-medium">{card.projectName}</span>
            <span aria-hidden>·</span>
            {card.hostLiveness && (
              <time dateTime={session.executionHostLastEventAt ?? undefined}>
                {card.hostLiveness}
              </time>
            )}
            <ProviderModel
              providerId={session.providerId}
              model={session.model}
            />

            {wireHint ? (
              <Tooltip label={wireHint.label}>
                <span
                  aria-label={wireHint.label}
                  className={cn(
                    'relative flex shrink-0 items-center gap-0.5 tabular-nums',
                    wireHint.outgoing + wireHint.incoming > 0
                      ? 'text-success-ink'
                      : 'text-ink-muted',
                  )}
                >
                  <Cable aria-hidden className="size-3" />
                  {wireHint.total}
                </span>
              </Tooltip>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-1.5 text-2xs text-ink-muted">
            <span className="truncate font-medium">{card.projectName}</span>
            <span aria-hidden>·</span>
            <ProviderIcon
              providerId={session.providerId}
              className="size-3.5"
            />
            <span className="truncate">{card.providerLabel}</span>
          </div>
        )}

        {grid && card.crews.length > 0 ? (
          <div className={CREW_ROW_CLASS}>
            {card.crews.map((crew) => (
              <CrewMark key={crew.id} crew={crew} variant="chip" />
            ))}
          </div>
        ) : null}

        {grid ? null : (
          <p
            className={cn(
              'mt-auto truncate text-2xs',
              signal.hostUnreachable ? 'text-warning-ink' : 'text-ink-muted',
            )}
          >
            {activity}
          </p>
        )}
      </div>

      {grid ? (
        <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
          <span
            className={cn(
              'flex min-w-0 items-center gap-1.5 text-xs',
              signal.hostUnreachable
                ? 'text-warning-ink'
                : ACTIVITY_TEXT_STYLES[session.status],
            )}
          >
            {signal.running ? <Spinner size="xs" /> : null}
            <span className="truncate">{activity}</span>
          </span>

          <div className="flex shrink-0 items-center gap-1">
            {crewAction}

            {onHail ? (
              // Open or not, one control: a Toggle, pressed while its Hail
              // shows, in R7's chosen look, never a variant swapped in (DS-28).
              <Toggle
                size="xs"
                pressed={hailOpen}
                aria-label={`Hail ${session.name}`}
                onClick={() => onHail(card)}
                className="gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-pressed:opacity-100"
              >
                <Radio className="size-3" />
                Hail
              </Toggle>
            ) : null}
          </div>
        </div>
      ) : null}

      {children}
    </Card>
  )
}
