import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import type { FC } from 'react'
import { useSessionRelayStore } from '@/entities/session-relay'
import {
  SessionCardView,
  SessionCrewPicker,
  buildSessionWireHint,
} from '@/features/mission-control'
import type { SessionCard } from '@/features/mission-control'
import { HailPanel } from './hail-panel.container'
import { findRowEndIndex } from './session-card-row.pure'

interface SessionCardGridProps {
  cards: SessionCard[]
  /** The one Session being hailed anywhere in the room, or null. */
  hailSessionId: string | null
  onOpen: (card: SessionCard) => void
  onHail: (card: SessionCard) => void
  onCloseHail: () => void
}

/**
 * One responsive grid of Session Cards with the Hail opening under the right
 * row.
 *
 * Extracted so the flat room and every crew container render the same grid
 * rather than two drifting copies. The open Hail is owned above — a grid that
 * does not hold the hailed card simply renders no panel, which is what keeps
 * exactly one Hail open across all containers.
 */
export const SessionCardGrid: FC<SessionCardGridProps> = ({
  cards,
  hailSessionId,
  onOpen,
  onHail,
  onCloseHail,
}) => {
  // Subscribed to the stable wire list and narrowed per card below: a selector
  // that filtered inside the subscription would spin zustand.
  const relays = useSessionRelayStore((state) => state.relays)

  // Read from the live card list, so a Hail left open while its Session
  // changes state shows the new state rather than the one it opened on.
  const hailIndex = cards.findIndex((card) => card.session.id === hailSessionId)
  const hailCard = hailIndex >= 0 ? cards[hailIndex] : null

  /**
   * The Hail opens under the whole row its card sits in, and only the browser
   * knows which cards share that row in a responsive grid — so the row is
   * measured from the laid-out cards and re-measured whenever the grid
   * resizes. Before layout runs there is no row, and the panel simply waits.
   */
  const gridRef = useRef<HTMLDivElement>(null)
  const [rowEndIndex, setRowEndIndex] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (hailIndex < 0) {
      setRowEndIndex(null)
      return
    }

    const grid = gridRef.current
    if (!grid) return

    const measure = () => {
      const tops = [
        ...grid.querySelectorAll<HTMLElement>('[data-session-card]'),
      ].map((element) => element.offsetTop)
      setRowEndIndex(findRowEndIndex(tops, hailIndex))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [hailIndex, cards.length])

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
    >
      {cards.map((card, index) => (
        <Fragment key={card.session.id}>
          <SessionCardView
            card={card}
            hailOpen={card.session.id === hailSessionId}
            wireHint={buildSessionWireHint(relays, card.session.id)}
            crewAction={
              <SessionCrewPicker
                sessionId={card.session.id}
                sessionName={card.session.name}
              />
            }
            onOpen={onOpen}
            onHail={onHail}
          />
          {hailCard && rowEndIndex === index ? (
            <HailPanel card={hailCard} onClose={onCloseHail} />
          ) : null}
        </Fragment>
      ))}
    </div>
  )
}
