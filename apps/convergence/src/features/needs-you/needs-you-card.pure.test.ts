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
it('a review item offers Archive; a merged errand offers it even outside review (mutation: drop the review half)', () => {
  for (const attention of ['finished', 'failed'] as const) {
    expect(model(cardSession({ attention })).canArchive).toBe(true)
    expect(
      model(cardSession({ ...cardFixtures.open, attention })).canArchive,
    ).toBe(true)
  }
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

it('groups active sessions across projects and hosts once, after attention and before PR errands', () => {
  const cards = [
    model(cardSession({ id: 'local', status: 'running' })),
    model(
      cardSession({
        id: 'remote',
        projectId: 'other',
        executionHost: 'lm',
        status: 'running',
      }),
    ),
    model(
      cardSession({
        ...cardFixtures.open,
        id: 'running-pr',
        status: 'running',
      }),
    ),
    model(cardSession({ ...cardFixtures.pinned, status: 'running' })),
    model(
      cardSession({
        id: 'archived',
        status: 'running',
        archivedAt: '2026-09-12',
      }),
    ),
    model(cardFixtures.waiting),
    model(cardFixtures.noPr),
    model(cardFixtures.open),
    model(),
  ]
  expect(
    groupNeedsYou([...cards, cards[0]!]).map((g) => [
      g.title,
      g.cards.map((c) => c.session.id),
    ]),
  ).toEqual([
    ['Pinned', ['pinned']],
    ['Waiting on you', ['waiting']],
    ['Needs review', ['no-pr']],
    ['Working', ['local', 'remote', 'running-pr']],
    ['Errands with a PR', ['open']],
  ])
  expect(cards[3]!.summary).toBe('Working')
})

it('moves running sessions into waiting or review and removes the empty Working section', () => {
  for (const [attention, title] of [
    ['needs-input', 'Waiting on you'],
    ['needs-approval', 'Waiting on you'],
    ['failed', 'Needs review'],
    ['finished', 'Needs review'],
  ] as const) {
    const card = model(
      cardSession({
        attention,
        status: attention === 'finished' ? 'idle' : 'running',
      }),
    )
    expect(groupNeedsYou([card]).map((g) => g.title)).toEqual([title])
    expect(card.working).toBe(false)
  }
  const snoozed = needsYouCardModel(
    cardSession({ status: 'running', attention: 'needs-input' }),
    { ...cardContext, dismissed: true },
  )
  expect(groupNeedsYou([snoozed])).toEqual([])
})

it('keeps answered sessions in Working while parallel tasks run, then returns to review', () => {
  const session = cardSession({
    attention: 'finished',
    parallelWork: { running: 2, unknown: 0, failed: 0, stopped: 0 },
  })
  const active = needsYouCardModel(session, { ...cardContext, dismissed: true })
  expect(groupNeedsYou([active]).map((g) => g.title)).toEqual(['Working'])
  expect(active.summary).toBe('answered · 2 tasks running')
  expect(active.attentionGroup).toBeNull()
  expect(active.dismissLabel).toBeNull()
  expect(active.canArchive).toBe(false)
  const settled = model({
    ...session,
    parallelWork: { running: 0, unknown: 0, failed: 0, stopped: 0 },
  })
  expect(groupNeedsYou([settled]).map((g) => g.title)).toEqual(['Needs review'])
  expect(settled.summary).toBe('Finished')
})
