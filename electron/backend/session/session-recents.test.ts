import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { getDatabase, closeDatabase, resetDatabase } from '../database/database'
import { StateService } from '../state/state.service'
import { getRecentSessionIds, setRecentSessionIds } from './session-recents'

describe('session recents', () => {
  let state: StateService

  beforeEach(() => {
    state = new StateService(getDatabase())
  })

  afterEach(() => {
    closeDatabase()
    resetDatabase()
  })

  it('returns empty array when unset', () => {
    expect(getRecentSessionIds(state)).toEqual([])
  })

  it('round-trips an array of ids', () => {
    setRecentSessionIds(state, ['a', 'b', 'c'])
    expect(getRecentSessionIds(state)).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array when stored value is malformed', () => {
    state.set('recent_session_ids', 'not json')
    expect(getRecentSessionIds(state)).toEqual([])
  })

  it('filters non-string entries', () => {
    state.set('recent_session_ids', JSON.stringify(['a', 1, null, 'b']))
    expect(getRecentSessionIds(state)).toEqual(['a', 'b'])
  })

  it('overwrites previous value', () => {
    setRecentSessionIds(state, ['a', 'b'])
    setRecentSessionIds(state, ['c'])
    expect(getRecentSessionIds(state)).toEqual(['c'])
  })
})
