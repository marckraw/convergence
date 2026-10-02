import { describe, expect, it } from 'vitest'
import { sumTurnFileCounts, turnFileLabel } from './turn-card.pure'

describe('sumTurnFileCounts', () => {
  it('adds every file’s lines', () => {
    expect(
      sumTurnFileCounts([
        { additions: 3, deletions: 1 },
        { additions: 0, deletions: 4 },
        { additions: 10, deletions: 0 },
      ]),
    ).toEqual({ additions: 13, deletions: 5 })
  })

  it('is nothing for no files', () => {
    expect(sumTurnFileCounts([])).toEqual({ additions: 0, deletions: 0 })
  })
})

describe('turnFileLabel', () => {
  it('counts the files, one or many', () => {
    expect(turnFileLabel('completed', 1)).toBe('1 file')
    expect(turnFileLabel('completed', 4)).toBe('4 files')
    expect(turnFileLabel('running', 2)).toBe('2 files')
  })

  it('says a turn with no files is still working, while it runs', () => {
    expect(turnFileLabel('running', 0)).toBe('working…')
  })

  it('says a finished turn with no files changed nothing', () => {
    expect(turnFileLabel('completed', 0)).toBe('no changes')
    expect(turnFileLabel('errored', 0)).toBe('no changes')
  })
})
