import { describe, expect, it } from 'vitest'
import { filterComboboxItems, groupComboboxItems } from './combobox.pure'

const items = [
  { id: 'alpha', label: 'Alpha', description: '/tmp/alpha' },
  { id: 'beta', label: 'Beta', description: '/tmp/projects/beta' },
  { id: 'gamma', label: 'Gamma', badge: { label: 'ALPHA' } },
]

describe('filterComboboxItems', () => {
  it('keeps every item for an empty or blank query', () => {
    expect(filterComboboxItems(items, '')).toEqual(items)
    expect(filterComboboxItems(items, '   ')).toEqual(items)
  })

  it('matches the label, the description and the badge, ignoring case', () => {
    expect(filterComboboxItems(items, 'BETA').map((item) => item.id)).toEqual([
      'beta',
    ])
    expect(
      filterComboboxItems(items, 'projects/').map((item) => item.id),
    ).toEqual(['beta'])
    expect(filterComboboxItems(items, 'alpha').map((item) => item.id)).toEqual([
      'alpha',
      'gamma',
    ])
  })

  it('does not match a group heading', () => {
    expect(
      filterComboboxItems([{ label: 'one', group: 'Recent' }], 'recent'),
    ).toEqual([])
  })
})

describe('groupComboboxItems', () => {
  it('cuts the items into runs that share a heading, in order', () => {
    const runs = groupComboboxItems([
      { label: 'a', group: 'Recent' },
      { label: 'b', group: 'Recent' },
      { label: 'c' },
      { label: 'd', group: 'All' },
    ])
    expect(
      runs.map((run) => [run.label, run.items.map((item) => item.label)]),
    ).toEqual([
      ['Recent', ['a', 'b']],
      [null, ['c']],
      ['All', ['d']],
    ])
  })

  it('gives no runs for no items', () => {
    expect(groupComboboxItems([])).toEqual([])
  })
})
