import { expect, it } from 'vitest'
import {
  cardContext,
  cardFixtures,
  cardSession,
} from './needs-you-card.fixture'
import { groupNeedsYou, needsYouCardModel } from './needs-you-card.pure'
const model = (s = cardSession()) => needsYouCardModel(s, cardContext)
it('origin is durable; repository outranks resident and unknown has no kind (mutation: default resident or ignore origin)', () => {
  expect(model(cardFixtures.unknown).kind).toBeNull()
  expect(model(cardFixtures.remote).kind).toBe('errand')
  expect(model(cardFixtures.open).kind).toBe('errand')
  expect(
    model(
      cardSession({
        originKind: 'spawn',
        parentSessionId: 'parent',
        forkStrategy: 'full',
      }),
    ).kind,
  ).toBe('errand')
  expect(model().kind).toBe('resident')
})
it('only merged errands offer Archive (mutation: archive an open errand)', () => {
  expect(model(cardFixtures.merged).canArchive).toBe(true)
  expect(model(cardFixtures.open).canArchive).toBe(false)
  expect(
    model(cardSession({ ...cardFixtures.merged, originKind: 'resident' }))
      .canArchive,
  ).toBe(false)
})
it('pinned wins, each session occurs once, groups sort by last moved (mutation: ignore pinnedAt)', () => {
  const cards = [
    model(cardFixtures.open),
    model(cardFixtures.waiting),
    model(cardFixtures.noPr),
    model(cardSession({ ...cardFixtures.pinned, attention: 'finished' })),
    model(
      cardSession({
        ...cardFixtures.waiting,
        id: 'later',
        updatedAt: '2026-09-12T12:04:00Z',
      }),
    ),
  ]
  expect(
    groupNeedsYou(cards).map((g) => [
      g.title,
      g.cards.map((c) => c.session.id),
    ]),
  ).toEqual([
    ['Pinned', ['pinned']],
    ['Waiting on you', ['later', 'waiting']],
    ['Needs review', ['no-pr']],
    ['Errands with a PR', ['open']],
  ])
})
it('dismissed errands with PRs stay until archived (mutation: discard dismissed PR errands)', () => {
  const cards = [
    needsYouCardModel(
      cardSession({ ...cardFixtures.open, attention: 'finished' }),
      { ...cardContext, dismissed: true },
    ),
    model(cardSession({ ...cardFixtures.merged, archivedAt: '2026-09-12' })),
  ]
  expect(
    groupNeedsYou(cards).flatMap((g) => g.cards.map((c) => c.session.id)),
  ).toEqual(['open'])
})
