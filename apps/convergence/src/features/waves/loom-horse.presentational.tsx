import type { FC, ReactNode } from 'react'
import { Circle, CircleHelp, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  loomHorseRuntimeLabel,
  loomHorseTicketLine,
  type LoomHorse,
  type LoomHorseRuntime,
} from './loom-horses.pure'
import {
  LOOM_HORSE_CARD_CLASS,
  LOOM_HORSE_META_CLASS,
  LOOM_HORSE_RUNTIME_CLASS,
  LOOM_HORSE_TICKET_DOOR_CLASS,
  LOOM_HORSE_TINT_CLASS,
} from './wave-panel.styles'

const RUNTIME_ICON: Readonly<Record<LoomHorseRuntime, typeof Circle>> = {
  working: LoaderCircle,
  idle: Circle,
  failed: CircleX,
  'not-seen': CircleHelp,
}

export interface LoomHorseCardProps {
  meterSlot?: ReactNode
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

/** An id base from a horse key: keys carry `:` and names may carry more. */
function idBaseFor(key: string): string {
  return `loom-horse-${key.replace(/[^A-Za-z0-9_-]/g, '_')}`
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
  const ids = idBaseFor(horse.key)
  const doorLabel = horse.runtime === 'failed' ? 'View run error →' : 'Open →'

  return (
    <div className="px-3 py-0.5" data-loom-horse={horse.key}>
      <div
        className={cn(
          LOOM_HORSE_CARD_CLASS,
          LOOM_HORSE_TINT_CLASS[horse.runtime],
          'relative',
          openable && 'hover:bg-white/5',
        )}
      >
        {openable ? (
          <Button
            type="button"
            variant="ghost"
            aria-labelledby={[
              `${ids}-seat`,
              `${ids}-runtime`,
              `${ids}-ticket`,
              meta ? `${ids}-meta` : null,
              `${ids}-open`,
            ]
              .filter((id): id is string => id !== null)
              .join(' ')}
            className="absolute inset-0 h-auto w-full rounded-lg p-0 hover:bg-transparent"
            onClick={() => onOpenSeat?.(horse.sessionId!)}
          />
        ) : null}
        <span className="flex w-full items-baseline gap-1.5">
          <Icon
            className={cn(
              'size-3 shrink-0',
              horse.runtime === 'working' && 'animate-spin',
            )}
            aria-hidden
          />
          <span id={`${ids}-seat`} className="min-w-0 truncate font-medium">
            {horse.seat ?? 'unnamed seat'}
          </span>
          <span className="flex-1" />
          <span id={`${ids}-runtime`} className={LOOM_HORSE_RUNTIME_CLASS}>
            {loomHorseRuntimeLabel(horse)}
          </span>
        </span>
        {meterSlot}
        {ticketDoor ? (
          <Button
            type="button"
            variant="ghost"
            // Its own mark, so focus can come back HERE when the detail it
            // opened closes (MAR-3195 lap 2, E).
            data-loom-horse-ticket={horse.key}
            className={LOOM_HORSE_TICKET_DOOR_CLASS}
            onClick={onShowDetail}
          >
            <span id={`${ids}-ticket`} className="line-clamp-2 min-w-0">
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
          <span id={`${ids}-meta`} className={LOOM_HORSE_META_CLASS}>
            {meta}
          </span>
        ) : null}
        {openable ? (
          <span id={`${ids}-open`} className={LOOM_HORSE_META_CLASS}>
            {doorLabel}
          </span>
        ) : (
          // The same words a row uses when it cannot be opened, so the two
          // surfaces refuse in one vocabulary.
          <span className={LOOM_HORSE_META_CLASS}>
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
      </div>
      {ticketDoor ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          // Its own mark, so focus can come back HERE and not to the card's
          // first button (MAR-3195 lap 2, E).
          data-loom-horse-details={horse.key}
          className="h-6 px-1 text-[11px] text-muted-foreground"
          onClick={onShowDetail}
        >
          Details
        </Button>
      ) : null}
      {horse.runtime === 'idle' && onShowNext ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1 text-[11px] text-muted-foreground"
          onClick={onShowNext}
        >
          View next work →
        </Button>
      ) : null}
    </div>
  )
}
