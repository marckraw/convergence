import type { FC } from 'react'
import { Circle, CircleHelp, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  loomHorseRuntimeLabel,
  type LoomHorse,
  type LoomHorseRuntime,
} from './loom-horses.pure'
import {
  LOOM_HORSE_CARD_CLASS,
  LOOM_HORSE_META_CLASS,
  LOOM_HORSE_RUNTIME_CLASS,
  LOOM_HORSE_TINT_CLASS,
} from './wave-panel.styles'

const RUNTIME_ICON: Readonly<Record<LoomHorseRuntime, typeof Circle>> = {
  working: LoaderCircle,
  idle: Circle,
  failed: CircleX,
  'not-seen': CircleHelp,
}

interface LoomHorseCardProps {
  horse: LoomHorse
  /** Opens the seat's conversation; absent when there is none to open. */
  onOpenSeat?: (sessionId: string) => void
  /** Shows the seat what is queued for it -- the Next sheet, in place. */
  onShowNext?: () => void
  /**
   * Reads the held issue in place (MAR-3195). A SIBLING of the card, never
   * nested inside it: a held `working` row is listed nowhere else (LV2 R4),
   * so this is that issue's only door -- and a button inside a button is not
   * one a person can reach.
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
 */
export const LoomHorseCard: FC<LoomHorseCardProps> = ({
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
  const ticket = held
    ? `${held.entry.issueIdentifier} · ${held.entry.issueTitle}`
    : 'No active ticket'
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

  const inside = (
    <>
      <span className="flex w-full items-baseline gap-1.5">
        <Icon
          className={cn(
            'size-3 shrink-0',
            horse.runtime === 'working' && 'animate-spin',
          )}
          aria-hidden
        />
        <span className="min-w-0 truncate font-medium">
          {horse.seat ?? 'unnamed seat'}
        </span>
        <span className="flex-1" />
        <span className={LOOM_HORSE_RUNTIME_CLASS}>
          {loomHorseRuntimeLabel(horse)}
        </span>
      </span>
      <span className="line-clamp-2 w-full min-w-0 text-left">{ticket}</span>
      {meta ? <span className={LOOM_HORSE_META_CLASS}>{meta}</span> : null}
    </>
  )

  return (
    <div className="px-3 py-0.5" data-loom-horse={horse.key}>
      {openable ? (
        <Button
          type="button"
          variant="ghost"
          className={cn(
            LOOM_HORSE_CARD_CLASS,
            LOOM_HORSE_TINT_CLASS[horse.runtime],
            'hover:bg-white/5',
          )}
          onClick={() => onOpenSeat?.(horse.sessionId!)}
        >
          {inside}
          <span className={LOOM_HORSE_META_CLASS}>
            {horse.runtime === 'failed' ? 'View run error →' : 'Open →'}
          </span>
        </Button>
      ) : (
        <div
          className={cn(
            LOOM_HORSE_CARD_CLASS,
            LOOM_HORSE_TINT_CLASS[horse.runtime],
          )}
        >
          {inside}
          {/* The same words a row uses when it cannot be opened, so the two
              surfaces refuse in one vocabulary. */}
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
        </div>
      )}
      {held && onShowDetail ? (
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
