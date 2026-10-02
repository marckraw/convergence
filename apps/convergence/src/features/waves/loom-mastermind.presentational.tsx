import type { ReactNode } from 'react'
import { Button, cn } from '@convergence/ui'
import {
  loomHorseRuntimeLabel,
  loomMastermindVerdictLine,
  loomSeatCardIds,
  type LoomMastermind,
} from './loom-horses.pure'
import {
  LOOM_CARD_HEAD_CLASS,
  LOOM_HORSE_CARD_CLASS,
  LOOM_HORSE_META_CLASS,
  LOOM_HORSE_META_INK,
  LOOM_HORSE_RUNTIME_CLASS,
  LOOM_HORSE_TINT_CLASS,
  LOOM_SEAT_CARD_DOOR_CLASS,
} from './wave-panel.styles'

export interface LoomMastermindCardProps {
  mastermind: LoomMastermind
  showCrewName?: boolean
  meterSlot?: ReactNode
  onOpenSeat?: (sessionId: string) => void
}

/** The crew's verdict seat, using the horses' runtime vocabulary and card surface. */
export function LoomMastermindCard({
  mastermind,
  showCrewName = false,
  meterSlot,
  onOpenSeat,
}: LoomMastermindCardProps) {
  const openable = mastermind.openable && onOpenSeat !== undefined
  const ids = loomSeatCardIds('mastermind', mastermind.key)
  const metaClass = cn(
    LOOM_HORSE_META_CLASS,
    LOOM_HORSE_META_INK[mastermind.runtime],
  )
  return (
    <div className="px-3 py-0.5" data-loom-mastermind={mastermind.key}>
      <div
        className={cn(
          LOOM_HORSE_CARD_CLASS,
          LOOM_HORSE_TINT_CLASS[mastermind.runtime],
          'relative',
          openable && 'hover:bg-fill-hover',
        )}
      >
        {openable ? (
          <Button
            type="button"
            variant="ghost"
            aria-labelledby={[
              `${ids}-seat`,
              `${ids}-runtime`,
              `${ids}-verdict`,
              mastermind.hostLabel ? `${ids}-host` : null,
              `${ids}-open`,
            ]
              .filter((id): id is string => id !== null)
              .join(' ')}
            onClick={() => onOpenSeat?.(mastermind.sessionId!)}
            size="lg"
            className={LOOM_SEAT_CARD_DOOR_CLASS}
          />
        ) : null}
        <span className={LOOM_CARD_HEAD_CLASS}>
          <span id={`${ids}-seat`} className="min-w-0 truncate font-medium">
            {mastermind.seat ?? 'unnamed seat'}
            {showCrewName && mastermind.crewName
              ? ` · ${mastermind.crewName}`
              : null}
          </span>
          <span className="flex-1" />
          <span id={`${ids}-runtime`} className={LOOM_HORSE_RUNTIME_CLASS}>
            {loomHorseRuntimeLabel(mastermind)}
          </span>
        </span>
        {meterSlot}
        <span id={`${ids}-verdict`} className="text-left tabular-nums">
          {loomMastermindVerdictLine(mastermind.waitingReturns)}
        </span>
        {mastermind.hostLabel ? (
          <span id={`${ids}-host`} className={metaClass}>
            {mastermind.hostLabel}
          </span>
        ) : null}
        {openable ? (
          <span id={`${ids}-open`} className={metaClass}>
            Open →
          </span>
        ) : null}
      </div>
    </div>
  )
}
