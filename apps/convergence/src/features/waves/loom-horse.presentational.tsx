import type { FC, ReactNode } from 'react'
import { Circle, CircleHelp, CircleX, LoaderCircle } from 'lucide-react'
import { Button, Card, CardAction, cn, Spinner } from '@convergence/ui'
import {
  loomHorseRuntimeLabel,
  loomHorseTicketLine,
  loomSeatCardIds,
  type LoomHorse,
  type LoomHorseRuntime,
} from './loom-horses.pure'
import {
  LOOM_CARD_HEAD_CLASS,
  LOOM_HORSE_CARD_CLASS,
  LOOM_HORSE_META_CLASS,
  LOOM_HORSE_META_INK,
  LOOM_HORSE_RUNTIME_CLASS,
  LOOM_HORSE_TICKET_DOOR_CLASS,
  LOOM_HORSE_TINT_CLASS,
  LOOM_SEAT_CARD_DOOR_CLASS,
} from './wave-panel.styles'

const RUNTIME_ICON: Readonly<Record<LoomHorseRuntime, typeof Circle>> = {
  working: LoaderCircle,
  idle: Circle,
  failed: CircleX,
  'not-seen': CircleHelp,
}

export interface LoomHorseCardProps {
  meterSlot?: ReactNode
  /** What the seat's account can reach, Figma and Linear (MAR-3519). */
  accessSlot?: ReactNode
  horse: LoomHorse
  /** Opens the seat's conversation; absent when there is none to open. */
  onOpenSeat?: (sessionId: string) => void
  /** Shows the seat what is queued for it -- the Next sheet, in place. */
  onShowNext?: () => void
  /**
   * Reads the card's issue in place (MAR-3195): the held one, else the one
   * sent and not yet started (MAR-3204). Two doors lead here -- the ticket
   * line and `Details` -- and neither sits inside the card's own button.
   */
  onShowDetail?: () => void
}

/**
 * One horse seat on the Now sheet (MAR-3191 R3).
 *
 * Two lines, and the split is the rule: the first says what the SEAT is doing
 * (the session's word), the second what the TRACKER says about the issue it
 * holds. A failed run on an In Progress issue is both of those at once, and a
 * card that merged them would have to pick one and lie about the other.
 *
 * Two doors (MAR-3204 R4): the card opens the conversation, the ticket line
 * opens the issue. They are SIBLINGS -- the card's door is a button stretched
 * over the card, the line a button raised above it -- because a button inside
 * a button is not a door anybody can reach, and a click on the line must not
 * travel on to the card. The card's door is named by the card's own text, so
 * its accessible name still carries the issue (MAR-3191 lap 2, D).
 */
export const LoomHorseCard: FC<LoomHorseCardProps> = ({
  meterSlot,
  accessSlot,
  horse,
  onOpenSeat,
  onShowNext,
  onShowDetail,
}) => {
  const Icon = RUNTIME_ICON[horse.runtime]
  // The model's own answer (R6), never `sessionId !== null`: a resident whose
  // conversation is not loaded has an id and nothing behind it.
  const openable = horse.openable && onOpenSeat !== undefined
  const held = horse.held
  // The issue the line is about: held, else sent and not yet started.
  const ticketRow = held ?? horse.dispatched
  const ticket = loomHorseTicketLine(horse)
  const ticketDoor = ticketRow !== null && onShowDetail !== undefined
  const meta = [
    horse.hostLabel,
    held ? `Linear: ${held.entry.trackerStatus}` : null,
    held ? `Lap ${held.entry.lap}` : null,
    // A blocked held row says so on the card and stays under Decide (A).
    horse.heldFrom === 'decide' ? 'blocked · decide' : null,
    horse.returned
      ? `lap ${horse.returned.entry.lap} returned · Fable’s turn`
      : null,
    horse.hostMarker,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')
  const ids = loomSeatCardIds('horse', horse.key)
  const doorLabel = horse.runtime === 'failed' ? 'View run error →' : 'Open →'
  const metaClass = cn(
    LOOM_HORSE_META_CLASS,
    LOOM_HORSE_META_INK[horse.runtime],
  )

  return (
    <div className="px-3 py-0.5" data-loom-horse={horse.key}>
      <Card
        interactive={openable}
        padding="none"
        className={cn(
          LOOM_HORSE_CARD_CLASS,
          LOOM_HORSE_TINT_CLASS[horse.runtime],
        )}
      >
        <span className={LOOM_CARD_HEAD_CLASS}>
          {/* A horse at work turns the kit's Spinner, which stands still
              under reduced motion (MC-25); the others wear their glyph. */}
          {horse.runtime === 'working' ? (
            <Spinner size="xs" />
          ) : (
            <Icon className="size-3 shrink-0" aria-hidden />
          )}
          {openable ? (
            <CardAction
              id={`${ids}-seat`}
              aria-labelledby={[
                `${ids}-seat`,
                `${ids}-runtime`,
                `${ids}-ticket`,
                meta ? `${ids}-meta` : null,
                `${ids}-open`,
              ]
                .filter((id): id is string => id !== null)
                .join(' ')}
              onClick={() => onOpenSeat?.(horse.sessionId!)}
              className={LOOM_SEAT_CARD_DOOR_CLASS}
            >
              {horse.seat ?? 'unnamed seat'}
            </CardAction>
          ) : (
            <span id={`${ids}-seat`} className={LOOM_SEAT_CARD_DOOR_CLASS}>
              {horse.seat ?? 'unnamed seat'}
            </span>
          )}
          <span className="flex-1" />
          <span id={`${ids}-runtime`} className={LOOM_HORSE_RUNTIME_CLASS}>
            {loomHorseRuntimeLabel(horse)}
          </span>
        </span>
        {meterSlot}
        {accessSlot}
        {ticketDoor ? (
          <Button
            type="button"
            variant="link"
            data-loom-horse-ticket={horse.key}
            onClick={onShowDetail}
            className={LOOM_HORSE_TICKET_DOOR_CLASS}
          >
            <span
              id={`${ids}-ticket`}
              className="line-clamp-2 min-w-0 text-left"
            >
              {ticket}
            </span>
          </Button>
        ) : (
          <span
            id={`${ids}-ticket`}
            className="line-clamp-2 w-full min-w-0 text-left"
          >
            {ticket}
          </span>
        )}
        {meta ? (
          <span id={`${ids}-meta`} className={metaClass}>
            {meta}
          </span>
        ) : null}
        {openable ? (
          <span id={`${ids}-open`} className={metaClass}>
            {doorLabel}
          </span>
        ) : (
          // The same words a row uses when it cannot be opened, so the two
          // surfaces refuse in one vocabulary.
          <span className={metaClass}>
            {horse.kind === 'dynamic'
              ? 'no conversation for this seat'
              : horse.conversationMissing
                ? // The record knows the difference (lap 2, C): a deleted
                  // conversation is not one the app has yet to fetch, and a
                  // person can act on the first and only wait for the second.
                  'conversation deleted'
                : 'conversation not loaded'}
          </span>
        )}
      </Card>
      {ticketDoor ? (
        <Button
          type="button"
          variant="ghost"
          data-loom-horse-details={horse.key}
          onClick={onShowDetail}
          size="xs"
          className="text-ink-muted"
        >
          Details
        </Button>
      ) : null}
      {horse.runtime === 'idle' && onShowNext ? (
        <Button
          type="button"
          variant="ghost"
          onClick={onShowNext}
          size="xs"
          className="text-ink-muted"
        >
          View next work →
        </Button>
      ) : null}
    </div>
  )
}
