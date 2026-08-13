import { useCallback, useMemo } from 'react'
import type { FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import {
  SessionCardView,
  useMissionControlCards,
} from '@/features/mission-control'
import type { SessionCard } from '@/features/mission-control'
import { MissionControlView } from './mission-control.presentational'

interface MissionControlProps {
  onOpenSession?: (session: SessionSummary) => void
}

export const MissionControl: FC<MissionControlProps> = ({ onOpenSession }) => {
  const { cards } = useMissionControlCards()

  const attentionCount = useMemo(
    () => cards.filter((card) => card.session.attention !== 'none').length,
    [cards],
  )
  const runningCount = useMemo(
    () => cards.filter((card) => card.session.status === 'running').length,
    [cards],
  )

  const handleOpen = useCallback(
    (card: SessionCard) => {
      onOpenSession?.(card.session)
    },
    [onOpenSession],
  )

  return (
    <MissionControlView
      totalCount={cards.length}
      attentionCount={attentionCount}
      runningCount={runningCount}
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {cards.map((card) => (
          <SessionCardView
            key={card.session.id}
            card={card}
            onOpen={handleOpen}
          />
        ))}
      </div>
    </MissionControlView>
  )
}
