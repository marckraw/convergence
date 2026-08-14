import { useCallback, useEffect, useState } from 'react'
import {
  loadMissionControlView,
  saveMissionControlView,
} from './mission-control-view.api'
import {
  EMPTY_SESSION_CARD_FILTER,
  toggleFilterId,
  toggleSessionCardState,
} from './session-card-filter.pure'
import type { SessionCardFilter } from './session-card-filter.pure'
import type { SessionCardOrderPreset } from './session-card-order.pure'
import type { SessionCardState } from './session-card-state.pure'

export interface MissionControlViewState {
  filter: SessionCardFilter
  order: SessionCardOrderPreset
  setQuery: (query: string) => void
  setOrder: (order: SessionCardOrderPreset) => void
  toggleState: (state: SessionCardState) => void
  clearStates: () => void
  toggleProject: (id: string) => void
  clearProjects: () => void
  toggleProvider: (id: string) => void
  clearProviders: () => void
  clearFilter: () => void
}

/**
 * Owns the shape of the room — ordering and every filter dimension — and
 * remembers it across restarts.
 *
 * Hydration is synchronous in the initial state so Mission Control never
 * paints the default room and then snaps to the stored one.
 */
export function useMissionControlView(): MissionControlViewState {
  const [filter, setFilter] = useState<SessionCardFilter>(() => {
    const stored = loadMissionControlView()
    return {
      ...EMPTY_SESSION_CARD_FILTER,
      states: stored.states,
      projectIds: stored.projectIds,
      providerIds: stored.providerIds,
    }
  })
  const [order, setOrder] = useState<SessionCardOrderPreset>(
    () => loadMissionControlView().order,
  )

  useEffect(() => {
    saveMissionControlView({
      order,
      states: [...filter.states],
      projectIds: [...filter.projectIds],
      providerIds: [...filter.providerIds],
    })
  }, [order, filter.states, filter.projectIds, filter.providerIds])

  const setQuery = useCallback((query: string) => {
    setFilter((current) => ({ ...current, query }))
  }, [])

  const toggleState = useCallback((state: SessionCardState) => {
    setFilter((current) => ({
      ...current,
      states: toggleSessionCardState(current.states, state),
    }))
  }, [])

  const clearStates = useCallback(() => {
    setFilter((current) => ({ ...current, states: [] }))
  }, [])

  const toggleProject = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      projectIds: toggleFilterId(current.projectIds, id),
    }))
  }, [])

  const clearProjects = useCallback(() => {
    setFilter((current) => ({ ...current, projectIds: [] }))
  }, [])

  const toggleProvider = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      providerIds: toggleFilterId(current.providerIds, id),
    }))
  }, [])

  const clearProviders = useCallback(() => {
    setFilter((current) => ({ ...current, providerIds: [] }))
  }, [])

  const clearFilter = useCallback(() => {
    setFilter(EMPTY_SESSION_CARD_FILTER)
  }, [])

  return {
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
  }
}
