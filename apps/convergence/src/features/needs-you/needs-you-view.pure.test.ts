import { expect, it } from 'vitest'
import {
  cardContext,
  cardSession,
  cardFixtures,
} from './needs-you-card.fixture'
import { groupNeedsYou, needsYouCardModel } from './needs-you-card.pure'
import {
  buildFeedView,
  defaultFeedView,
  readFeedView,
  holdFeedOrder,
  feedOrderKey,
} from './needs-you-view.pure'

const source = groupNeedsYou(
  [
    cardSession({
      id: 'pin',
      pinnedAt: '2026-09-12',
      providerId: 'claude-code',
      status: 'running',
    }),
    cardSession({
      id: 'failed',
      attention: 'failed',
      name: 'B',
      providerId: 'codex',
    }),
    cardSession({
      id: 'working',
      status: 'running',
      name: 'A',
      providerId: 'codex',
    }),
    cardFixtures.open,
  ].map((session) => needsYouCardModel(session, cardContext)),
)
const ids = (result: ReturnType<typeof buildFeedView>) =>
  result.groups.flatMap((group) => group.cards.map((card) => card.session.id))

it('combines choices within a facet, intersects facets, counts choices before that facet, and hides nonmatching pins', () => {
  const result = buildFeedView(source, {
    ...defaultFeedView(),
    filters: { status: ['Working', 'Failed'], provider: ['codex'] },
  })
  expect(new Set(ids(result))).toEqual(new Set(['failed', 'working']))
  expect(result).toMatchObject({ total: 4, shown: 2, hiddenPins: 1 })
  expect(
    result.options.provider.find((option) => option.value === 'claude-code')
      ?.count,
  ).toBe(1)
  expect(
    result.options.status.find((option) => option.value === 'Idle')?.count,
  ).toBe(1)
})

it('retains zero-result selections so they can be removed and searches PR numbers', () => {
  const empty = buildFeedView(source, {
    ...defaultFeedView(),
    filters: { model: ['missing-model'] },
  })
  expect(empty.shown).toBe(0)
  expect(empty.options.model).toContainEqual({
    value: 'missing-model',
    label: 'missing-model',
    count: 0,
  })
  expect(
    ids(buildFeedView(source, { ...defaultFeedView(), query: '#42' })),
  ).toEqual(['open'])
})

it('sorts deterministically and can regroup pins without duplicating or discarding them', () => {
  const result = buildFeedView(source, {
    ...defaultFeedView(),
    groupBy: 'none',
    pinsFirst: false,
    sort: 'name',
  })
  expect(result.groups.map((group) => group.title)).toEqual(['Conversations'])
  expect(ids(result)).toEqual(['working', 'failed', 'open', 'pin'])
  const sections = buildFeedView(source, {
    ...defaultFeedView(),
    pinsFirst: false,
    sectionOrder: ['Working', 'Needs review', 'Errands with a PR'],
  })
  expect(sections.groups[0]?.cards.map((card) => card.session.id)).toEqual([
    'pin',
    'working',
  ])
  expect(ids(sections)).toHaveLength(4)
})

it('restores safe preferences and falls back for malformed storage', () => {
  expect(readFeedView('{')).toEqual(defaultFeedView())
  expect(
    readFeedView(
      JSON.stringify({
        sort: 'garbage',
        groupBy: {},
        filters: { status: ['Working', 'Working'], provider: 2 },
        pinsFirst: false,
      }),
    ),
  ).toMatchObject({
    sort: 'newest',
    groupBy: 'workflow',
    filters: { status: ['Working'] },
    pinsFirst: false,
  })
})

it('holds order during interaction but uses live card data and does not resurrect removed cards', () => {
  const previous = buildFeedView(source, {
    ...defaultFeedView(),
    groupBy: 'none',
    pinsFirst: false,
    sort: 'name',
  }).groups
  const current = buildFeedView(source, {
    ...defaultFeedView(),
    groupBy: 'none',
    pinsFirst: false,
    sort: 'name-desc',
  }).groups
  current[0]!.cards = current[0]!.cards
    .filter((card) => card.session.id !== 'failed')
    .map((card) => ({ ...card, lastMoved: 'updated live' }))
  const held = holdFeedOrder(current, previous)
  expect(held[0]!.cards.map((card) => card.session.id)).toEqual([
    'working',
    'open',
    'pin',
  ])
  expect(
    held[0]!.cards.every((card) => card.lastMoved === 'updated live'),
  ).toBe(true)
  expect(holdFeedOrder(current, null)).toBe(current)
  expect(feedOrderKey(held)).not.toBe(feedOrderKey(current))
  expect(feedOrderKey(current)).toBe(
    feedOrderKey(
      current.map((group) => ({
        ...group,
        cards: group.cards.map((card) => ({ ...card, lastMoved: 'later' })),
      })),
    ),
  )
})
