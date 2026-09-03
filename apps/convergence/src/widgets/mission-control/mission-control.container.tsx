import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FC } from 'react'
import { useCrewHailStore } from '@/entities/crew-hail'
import { useSessionCrewStore } from '@/entities/session-crew'
import {
  selectHopsForCrew,
  useSessionRelayStore,
} from '@/entities/session-relay'
import type { SessionSummary } from '@/entities/session'
import {
  CrewFlowSection,
  CrewHeaderMenu,
  countAlarmingHops,
  SessionCrewChips,
  SessionFacetPicker,
  SessionStateChips,
  groupSessionCardsByCrew,
  isEmptySessionCardFilter,
  sessionCrewGroupKey,
  useMissionControlCards,
  useMissionControlView,
} from '@/features/mission-control'
import type { SessionCard } from '@/features/mission-control'
import { CrewContainer } from './crew-container.presentational'
import { MissionControlView } from './mission-control.presentational'
import { SessionCanvas } from './session-canvas.container'
import { SessionCardGrid } from './session-card-grid.container'

interface MissionControlProps {
  onOpenSession?: (session: SessionSummary) => void
}

export const MissionControl: FC<MissionControlProps> = ({ onOpenSession }) => {
  const {
    filter,
    order,
    mode,
    setQuery,
    setOrder,
    setMode,
    toggleState,
    clearStates,
    toggleProject,
    clearProjects,
    toggleProvider,
    clearProviders,
    toggleCrew,
    clearCrews,
    clearFilter,
  } = useMissionControlView()
  const [hailSessionId, setHailSessionId] = useState<string | null>(null)

  const crews = useSessionCrewStore((state) => state.crews)
  const loadCrews = useSessionCrewStore((state) => state.load)
  const loadRelays = useSessionRelayStore((state) => state.load)
  const hopsByCrewId = useSessionRelayStore((state) => state.hopsByCrewId)
  const loadHails = useCrewHailStore((state) => state.load)

  useEffect(() => {
    void loadCrews()
    void loadRelays()
    void loadHails()
  }, [loadCrews, loadRelays, loadHails])

  const {
    cards,
    totalCount,
    stateCounts,
    projectFacets,
    providerFacets,
    crewFacets,
  } = useMissionControlCards({ filter, order })
  const attentionCount = useMemo(
    () => cards.filter((card) => card.session.attention !== 'none').length,
    [cards],
  )
  const runningCount = useMemo(
    () => cards.filter((card) => card.session.status === 'running').length,
    [cards],
  )
  const crewGroups = useMemo(
    () => groupSessionCardsByCrew(cards, crews),
    [cards, crews],
  )

  const handleHail = useCallback((card: SessionCard) => {
    setHailSessionId((current) =>
      current === card.session.id ? null : card.session.id,
    )
  }, [])

  const closeHail = useCallback(() => setHailSessionId(null), [])

  const handleOpen = useCallback(
    (card: SessionCard) => {
      onOpenSession?.(card.session)
    },
    [onOpenSession],
  )

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
      mode={mode}
      onModeChange={setMode}
      filterIsEmpty={isEmptySessionCardFilter(filter)}
      onClearFilter={clearFilter}
      fillsContent={mode === 'canvas'}
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
          <SessionCrewChips
            options={crewFacets}
            selected={filter.crewIds}
            onToggle={toggleCrew}
            onClear={clearCrews}
          />
        </>
      }
    >
      {mode === 'canvas' ? (
        <SessionCanvas groups={crewGroups} onOpen={handleOpen} />
      ) : mode === 'crews' ? (
        <div className="flex flex-col gap-3">
          {crewGroups.map((group) => (
            <CrewContainer
              key={sessionCrewGroupKey(group)}
              name={group.crew?.name ?? 'No crew'}
              emoji={group.crew?.emoji ?? null}
              accentColor={group.crew?.accentColor ?? null}
              memberCount={group.memberCount}
              visibleCount={group.cards.length}
              loose={group.crew === null}
              menu={
                group.crew ? <CrewHeaderMenu crew={group.crew} /> : undefined
              }
              flow={
                group.crew ? <CrewFlowSection crew={group.crew} /> : undefined
              }
              alarm={
                group.crew
                  ? countAlarmingHops(
                      selectHopsForCrew({ hopsByCrewId }, group.crew.id),
                    ) > 0
                  : false
              }
            >
              <SessionCardGrid
                cards={group.cards}
                hailSessionId={hailSessionId}
                onOpen={handleOpen}
                onHail={handleHail}
                onCloseHail={closeHail}
              />
            </CrewContainer>
          ))}
        </div>
      ) : (
        <SessionCardGrid
          cards={cards}
          hailSessionId={hailSessionId}
          onOpen={handleOpen}
          onHail={handleHail}
          onCloseHail={closeHail}
        />
      )}
    </MissionControlView>
  )
}
