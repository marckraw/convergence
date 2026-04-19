import { beforeEach, describe, expect, it } from 'vitest'
import { useCommandCenterStore } from './command-center.model'

describe('useCommandCenterStore', () => {
  beforeEach(() => {
    useCommandCenterStore.setState({ isOpen: false, query: '' })
  })

  it('opens and clears the query', () => {
    useCommandCenterStore.setState({ query: 'stale' })

    useCommandCenterStore.getState().open()

    const state = useCommandCenterStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.query).toBe('')
  })

  it('closes and clears the query', () => {
    useCommandCenterStore.setState({ isOpen: true, query: 'stale' })

    useCommandCenterStore.getState().close()

    const state = useCommandCenterStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.query).toBe('')
  })

  it('toggles open → closed and clears query each way', () => {
    useCommandCenterStore.getState().toggle()
    expect(useCommandCenterStore.getState().isOpen).toBe(true)

    useCommandCenterStore.setState({ query: 'typed' })
    useCommandCenterStore.getState().toggle()
    const closed = useCommandCenterStore.getState()
    expect(closed.isOpen).toBe(false)
    expect(closed.query).toBe('')
  })

  it('setQuery updates the query without touching isOpen', () => {
    useCommandCenterStore.setState({ isOpen: true, query: '' })

    useCommandCenterStore.getState().setQuery('hello')

    const state = useCommandCenterStore.getState()
    expect(state.query).toBe('hello')
    expect(state.isOpen).toBe(true)
  })
})
