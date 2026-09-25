import { describe, expect, it } from 'vitest'
import { selectProjectName } from './project-name.pure'

const state = {
  projects: [
    { id: 'p1', name: 'convergence' },
    { id: 'p2', name: 'emergence' },
  ],
}

describe('selectProjectName', () => {
  it('names the project the id points at, not the first or the active one', () => {
    expect(selectProjectName('p2')(state)).toBe('emergence')
    expect(selectProjectName('p1')(state)).toBe('convergence')
  })

  it('is null for no id and for an id the list does not hold', () => {
    expect(selectProjectName(null)(state)).toBeNull()
    expect(selectProjectName('gone')(state)).toBeNull()
  })
})
