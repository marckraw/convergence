import { expect, it } from 'vitest'
import { cardContext, cardSession } from './needs-you-card.fixture'
import { needsYouCardModel } from './needs-you-card.pure'
import { sortFeedCards, type FeedOrder } from './needs-you-order.pure'

const cards = [
  cardSession({
    id: 'older',
    name: 'Agent 10',
    createdAt: '2026-09-10',
    updatedAt: '2026-09-14',
  }),
  cardSession({
    id: 'newer',
    name: 'agent 2',
    createdAt: '2026-09-12',
    updatedAt: '2026-09-13',
  }),
  // Named so that A–Z disagrees with creation order: without this card every
  // `name` expectation below equals the `created` one, and a Name comparator
  // that quietly sorted by createdAt would stay green.
  cardSession({
    id: 'zulu',
    name: 'Zulu',
    createdAt: '2026-09-11',
    updatedAt: '2026-09-12',
  }),
].map((session) => needsYouCardModel(session, cardContext))
const ids = (items: typeof cards) => items.map((card) => card.session.id)

it.each<[FeedOrder, string[]]>([
  ['created', ['newer', 'zulu', 'older']],
  ['updated', ['older', 'newer', 'zulu']],
  ['name', ['newer', 'older', 'zulu']],
])('sorts by %s without mutating the input', (order, expected) => {
  expect(ids(sortFeedCards(cards, order))).toEqual(expected)
  expect(ids(cards)).toEqual(['older', 'newer', 'zulu'])
})

it('keeps created and name order during agent updates while updated order follows them', () => {
  const changed = cards.map((card) => ({
    ...card,
    session: {
      ...card.session,
      updatedAt: card.session.id === 'newer' ? '2026-09-15' : '2026-09-14',
    },
  }))
  for (const order of ['created', 'name'] as const) {
    expect(ids(sortFeedCards(changed, order))).toEqual(
      ids(sortFeedCards(cards, order)),
    )
  }
  expect(ids(sortFeedCards(changed, 'updated'))).toEqual([
    'newer',
    'older',
    'zulu',
  ])
})

it.each<FeedOrder>(['created', 'updated', 'name'])(
  'breaks %s ties by ID, never by live timestamps or incoming order',
  (order) => {
    const equal = ['b', 'a'].map((id) => ({
      ...cards[0]!,
      session: { ...cards[0]!.session, id },
    }))
    expect(ids(sortFeedCards(equal, order))).toEqual(['a', 'b'])
    expect(ids(sortFeedCards([...equal].reverse(), order))).toEqual(['a', 'b'])
  },
)

it('compares actual creation times across offsets and places missing times last', () => {
  const items = [
    { id: 'earlier', createdAt: '2026-09-14T12:00:00+02:00' },
    { id: 'later', createdAt: '2026-09-14T11:00:00Z' },
    { id: 'unknown', createdAt: '' },
  ].map((session) => ({
    ...cards[0]!,
    session: { ...cards[0]!.session, ...session },
  }))
  expect(ids(sortFeedCards(items, 'created'))).toEqual([
    'later',
    'earlier',
    'unknown',
  ])
})
