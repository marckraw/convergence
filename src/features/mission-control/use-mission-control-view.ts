import { useCallback, useEffect, useState } from 'react'
import {
  loadMissionControlView,
  saveMissionControlView,
} from './mission-control-view.api'
import type { MissionControlViewMode } from './mission-control-view.pure'
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
  mode: MissionControlViewMode
  setQuery: (query: string) => void
  setOrder: (order: SessionCardOrderPreset) => void
  setMode: (mode: MissionControlViewMode) => void
  toggleState: (state: SessionCardState) => void
  clearStates: () => void
  toggleProject: (id: string) => void
  clearProjects: () => void
  toggleProvider: (id: string) => void
  clearProviders: () => void
  toggleCrew: (id: string) => void
  clearCrews: () => void
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
      crewIds: stored.crewIds,
    }
  })
  const [order, setOrder] = useState<SessionCardOrderPreset>(
    () => loadMissionControlView().order,
  )
  const [mode, setMode] = useState<MissionControlViewMode>(
    () => loadMissionControlView().mode,
  )

  useEffect(() => {
    saveMissionControlView({
      mode,
      order,
      states: [...filter.states],
      projectIds: [...filter.projectIds],
      providerIds: [...filter.providerIds],
      crewIds: [...filter.crewIds],
    })
  }, [
    mode,
    order,
    filter.states,
    filter.projectIds,
    filter.providerIds,
    filter.crewIds,
  ])

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

  const toggleCrew = useCallback((id: string) => {
    setFilter((current) => ({
      ...current,
      crewIds: toggleFilterId(current.crewIds, id),
    }))
  }, [])

  const clearCrews = useCallback(() => {
    setFilter((current) => ({ ...current, crewIds: [] }))
  }, [])

  const clearFilter = useCallback(() => {
    setFilter(EMPTY_SESSION_CARD_FILTER)
  }, [])

  return {
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
  }
}
