import {
  Fragment,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
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
import { HailPanel } from './hail-panel.container'
import { MissionControlView } from './mission-control.presentational'
import { findRowEndIndex } from './session-card-row.pure'

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
      <div
        ref={gridRef}
        className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3"
      >
        {cards.map((card, index) => (
          <Fragment key={card.session.id}>
            <SessionCardView
              card={card}
              hailOpen={card.session.id === hailSessionId}
              onOpen={handleOpen}
              onHail={handleHail}
            />
            {hailCard && rowEndIndex === index ? (
              <HailPanel card={hailCard} onClose={closeHail} />
            ) : null}
          </Fragment>
        ))}
      </div>
    </MissionControlView>
  )
}
