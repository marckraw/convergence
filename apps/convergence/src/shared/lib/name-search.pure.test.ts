import { expect, it } from 'vitest'
import {
  filterByNameSearch,
  nameMatches,
  narrowSidebarSessionLists,
  noConversationMatchesLine,
  normalizeNameQuery,
} from './name-search.pure'

it('normalizeNameQuery trims and lower-cases', () => {
  expect(normalizeNameQuery('  FaBle  ')).toBe('fable')
})

it('empty query matches everything, including null and empty names', () => {
  expect(nameMatches('-- Fable Mastermind --', '')).toBe(true)
  expect(nameMatches(null, '   ')).toBe(true)
  expect(nameMatches(undefined, '')).toBe(true)
  expect(nameMatches('', '')).toBe(true)
})

it('matches case-insensitively by substring without stripping decoration', () => {
  expect(nameMatches('-- Fable Mastermind --', 'fable')).toBe(true)
  expect(nameMatches('-- Fable Mastermind --', '-- f')).toBe(true)
  expect(nameMatches('-- Fable Mastermind --', 'FABLE')).toBe(true)
  expect(nameMatches('-- Fable Mastermind --', 'missing')).toBe(false)
})

it('null or empty name never matches a non-empty query and never throws', () => {
  expect(nameMatches(null, 'fable')).toBe(false)
  expect(nameMatches(undefined, 'fable')).toBe(false)
  expect(nameMatches('', 'fable')).toBe(false)
})

it('R1 mutation: startsWith instead of contains fails on a decorated name', () => {
  // Guard: contains must keep matching a needle that is not a prefix.
  expect(nameMatches('-- Fable Mastermind --', 'mastermind')).toBe(true)
  const startsWithOnly = (name: string, query: string) =>
    name.toLowerCase().startsWith(normalizeNameQuery(query))
  expect(startsWithOnly('-- Fable Mastermind --', 'mastermind')).toBe(false)
})

it('filterByNameSearch keeps order and only drops non-matches', () => {
  const items = [
    { id: 'a', name: 'Alpha Fable' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Fable Gamma' },
  ]
  expect(filterByNameSearch(items, 'fable').map((item) => item.id)).toEqual([
    'a',
    'c',
  ])
  expect(filterByNameSearch(items, '').map((item) => item.id)).toEqual([
    'a',
    'b',
    'c',
  ])
})

it('R7 narrowSidebarSessionLists filters both lists together', () => {
  const globalSessions = [
    { id: 'g1', name: '-- Fable Mastermind --' },
    { id: 'g2', name: 'Review other' },
  ]
  const sessions = [
    { id: 'p1', name: 'Fable horse' },
    { id: 'p2', name: 'plain work' },
  ]
  const narrowed = narrowSidebarSessionLists(globalSessions, sessions, 'fable')
  expect(narrowed.globalSessions.map((s) => s.id)).toEqual(['g1'])
  expect(narrowed.sessions.map((s) => s.id)).toEqual(['p1'])
})

it('R7 mutation: filter only global leaves project sessions untouched → red', () => {
  const globalSessions = [{ id: 'g1', name: 'Fable' }]
  const sessions = [
    { id: 'p1', name: 'Fable' },
    { id: 'p2', name: 'other' },
  ]
  const broken = {
    globalSessions: filterByNameSearch(globalSessions, 'fable'),
    sessions,
  }
  expect(broken.sessions).toHaveLength(2)
  const correct = narrowSidebarSessionLists(globalSessions, sessions, 'fable')
  expect(correct.sessions).toHaveLength(1)
})

it('noConversationMatchesLine quotes the query', () => {
  expect(noConversationMatchesLine('fable')).toBe(
    'No conversation matches "fable"',
  )
})
