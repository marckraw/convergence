import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn.pure'
import { Button } from '@/shared/ui/button'
import {
  loomHorseRuntimeLabel,
  loomMastermindVerdictLine,
  type LoomMastermind,
} from './loom-horses.pure'
import {
  LOOM_HORSE_CARD_CLASS,
  LOOM_HORSE_META_CLASS,
  LOOM_HORSE_RUNTIME_CLASS,
  LOOM_HORSE_TINT_CLASS,
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
  const ids = `loom-mastermind-${mastermind.key.replace(/[^A-Za-z0-9_-]/g, '_')}`
  return (
    <div className="px-3 py-0.5" data-loom-mastermind={mastermind.key}>
      <div
        className={cn(
          LOOM_HORSE_CARD_CLASS,
          LOOM_HORSE_TINT_CLASS[mastermind.runtime],
          'relative',
          openable && 'hover:bg-white/5',
        )}
      >
        {openable ? (
          <Button
            type="button"
            variant="ghost"
            aria-labelledby={`${ids}-seat ${ids}-runtime ${ids}-verdict ${ids}-open`}
            className="absolute inset-0 h-auto w-full rounded-lg p-0 hover:bg-transparent"
            onClick={() => onOpenSeat?.(mastermind.sessionId!)}
          />
        ) : null}
        <span className="flex w-full items-baseline gap-1.5">
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
          <span className={LOOM_HORSE_META_CLASS}>{mastermind.hostLabel}</span>
        ) : null}
        {openable ? (
          <span id={`${ids}-open`} className={LOOM_HORSE_META_CLASS}>
            Open →
          </span>
        ) : null}
      </div>
    </div>
  )
}
