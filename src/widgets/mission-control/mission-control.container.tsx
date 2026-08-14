import { useCallback, useMemo, useState } from 'react'
import type { FC } from 'react'
import type { SessionSummary } from '@/entities/session'
import {
  SessionCardView,
  SessionFacetPicker,
  SessionStateChips,
  isEmptySessionCardFilter,
  useMissionControlCards,
  useMissionControlView,
} from '@/features/mission-control'
import type { SessionCard } from '@/features/mission-control'
import { HailDialog } from './hail-dialog.container'
import { MissionControlView } from './mission-control.presentational'

interface MissionControlProps {
  onOpenSession?: (session: SessionSummary) => void
}

export const MissionControl: FC<MissionControlProps> = ({ onOpenSession }) => {
  const {
    filter,
    order,
    setQuery,
    setOrder,
    toggleState,
    clearStates,
    toggleProject,
    clearProjects,
    toggleProvider,
    clearProviders,
    clearFilter,
  } = useMissionControlView()
  const [hailSessionId, setHailSessionId] = useState<string | null>(null)

  const { cards, totalCount, stateCounts, projectFacets, providerFacets } =
    useMissionControlCards({ filter, order })
  const attentionCount = useMemo(
    () => cards.filter((card) => card.session.attention !== 'none').length,
    [cards],
  )
  const runningCount = useMemo(
    () => cards.filter((card) => card.session.status === 'running').length,
    [cards],
  )

  const handleHail = useCallback((card: SessionCard) => {
    setHailSessionId(card.session.id)
  }, [])

  const handleHailOpenChange = useCallback((open: boolean) => {
    if (!open) setHailSessionId(null)
  }, [])

  const handleOpen = useCallback(
    (card: SessionCard) => {
      onOpenSession?.(card.session)
    },
    [onOpenSession],
  )

  // Read from the live card list, so a Hail left open while its Session
  // changes state shows the new state rather than the one it opened on.
  const hailCard = cards.find((card) => card.session.id === hailSessionId)

  return (
    <MissionControlView
      totalCount={totalCount}
      visibleCount={cards.length}
      attentionCount={attentionCount}
      runningCount={runningCount}
      query={filter.query}
      onQueryChange={setQuery}
      order={order}
      onOrderChange={setOrder}
      filterIsEmpty={isEmptySessionCardFilter(filter)}
      onClearFilter={clearFilter}
      filters={
        <>
          <SessionStateChips
            selected={filter.states}
            counts={stateCounts}
            onToggle={toggleState}
            onClear={clearStates}
          />
          <SessionFacetPicker
            label="Filter by project"
            allLabel="All projects"
            noun="project"
            searchPlaceholder="Search projects…"
            options={projectFacets}
            selected={filter.projectIds}
            onToggle={toggleProject}
            onClear={clearProjects}
          />
          <SessionFacetPicker
            label="Filter by provider"
            allLabel="All providers"
            noun="provider"
            searchPlaceholder="Search providers…"
            options={providerFacets}
            selected={filter.providerIds}
            onToggle={toggleProvider}
            onClear={clearProviders}
          />
        </>
      }
    >
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
        {cards.map((card) => (
          <SessionCardView
            key={card.session.id}
            card={card}
            hailOpen={card.session.id === hailSessionId}
            onOpen={handleOpen}
            onHail={handleHail}
          />
        ))}
      </div>

      <HailDialog card={hailCard ?? null} onOpenChange={handleHailOpenChange} />
    </MissionControlView>
  )
}
