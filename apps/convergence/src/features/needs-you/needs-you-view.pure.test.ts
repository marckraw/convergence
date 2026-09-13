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
  toggleFeedChoice,
} from './needs-you-view.pure'

const models = [
  cardSession({
    id: 'pin',
    pinnedAt: '2026-09-12',
    providerId: 'claude-code',
    status: 'running',
  }),
  cardSession({ id: 'failed', attention: 'failed', providerId: 'codex' }),
  cardSession({
    id: 'working',
    status: 'running',
    providerId: 'codex',
    executionHost: 'lm',
  }),
  cardSession({
    id: 'finished',
    attention: 'finished',
    providerId: 'codex',
    executionHost: 'second-server',
  }),
  cardSession({
    id: 'input',
    attention: 'needs-input',
    providerId: 'claude-code',
  }),
  cardSession({
    id: 'approval',
    attention: 'needs-approval',
    providerId: 'claude-code',
  }),
  cardFixtures.open,
].map((session) => needsYouCardModel(session, cardContext))
const source = groupNeedsYou(models)
const ids = (result: ReturnType<typeof buildFeedView>) =>
  result.groups.flatMap((group) => group.cards.map((card) => card.session.id))

it('uses attention, known work and review facts while All retains PR errands and pins', () => {
  const all = buildFeedView(source, defaultFeedView())
  expect(all.activityCounts).toEqual({
    all: 7,
    'needs-me': 3,
    working: 2,
    review: 1,
  })
  expect(ids(all)).toHaveLength(7)
  expect(
    ids(buildFeedView(source, { ...defaultFeedView(), activity: 'needs-me' })),
  ).toEqual(['approval', 'failed', 'input'])
  expect(
    ids(buildFeedView(source, { ...defaultFeedView(), activity: 'review' })),
  ).toEqual(['finished'])
  expect(models[0]!.session.pinnedAt).toBe('2026-09-12')
})

it('combines icon choices, intersects categories, and counts before each category', () => {
  const result = buildFeedView(source, {
    ...defaultFeedView(),
    activity: 'working',
    hosts: ['remote'],
    providers: ['openai'],
  })
  expect(ids(result)).toEqual(['working'])
  expect(result).toMatchObject({
    total: 7,
    shown: 1,
    hiddenPins: 1,
    activityCounts: { all: 2, 'needs-me': 0, working: 1, review: 1 },
    hostCounts: { local: 0, remote: 1 },
  })
  expect(result.providers).toContainEqual({
    value: 'anthropic',
    label: 'Anthropic',
    count: 0,
  })
  const both = buildFeedView(source, {
    ...defaultFeedView(),
    activity: 'working',
    hosts: ['local', 'remote'],
    providers: ['anthropic', 'openai'],
  })
  expect(new Set(ids(both))).toEqual(new Set(['pin', 'working']))
})

it('includes every remote endpoint and follows canonical local-host handling', () => {
  const cards = [
    '',
    undefined,
    'local',
    'lm',
    'second-server',
    'removed-endpoint',
  ].map((executionHost, i) =>
    needsYouCardModel(
      cardSession({ id: String(i), status: 'running', executionHost }),
      cardContext,
    ),
  )
  const groups = groupNeedsYou(cards)
  expect(
    ids(buildFeedView(groups, { ...defaultFeedView(), hosts: ['remote'] })),
  ).toEqual(['3', '4', '5'])
  expect(
    ids(buildFeedView(groups, { ...defaultFeedView(), hosts: ['local'] })),
  ).toEqual(['0', '1', '2'])
})

it('retains zero-count and no-longer-present provider switches, including unknown brands', () => {
  const view = { ...defaultFeedView(), providers: ['future-cli'] }
  const result = buildFeedView(source, view)
  expect(result.shown).toBe(0)
  expect(result.providers).toContainEqual({
    value: 'future-cli',
    label: 'future-cli',
    count: 0,
  })
  expect(buildFeedView([], view).providers).toEqual([
    { value: 'future-cli', label: 'future-cli', count: 0 },
  ])
  const unknown = needsYouCardModel(
    cardSession({ id: 'future', providerId: 'future-cli', status: 'running' }),
    cardContext,
  )
  expect(ids(buildFeedView(groupNeedsYou([unknown]), view))).toEqual(['future'])
})

it('combines provider aliases into one logo without confusing model vendors with providers', () => {
  const cards = ['codex', 'openai', 'pi'].map((providerId, i) =>
    needsYouCardModel(
      cardSession({
        id: String(i),
        providerId,
        model: 'openai/gpt-5.5',
        status: 'running',
      }),
      cardContext,
    ),
  )
  const result = buildFeedView(groupNeedsYou(cards), {
    ...defaultFeedView(),
    providers: ['openai'],
  })
  expect(ids(result)).toEqual(['0', '1'])
  expect(result.providers).toEqual([
    { value: 'openai', label: 'OpenAI', count: 2 },
    { value: 'pi', label: 'Pi', count: 1 },
  ])
})

it('does not manufacture attention from acknowledged cards or unknown background work', () => {
  const dismissed = needsYouCardModel(
    cardSession({
      id: 'dismissed',
      attention: 'failed',
      pinnedAt: '2026-09-12',
    }),
    { ...cardContext, dismissed: true },
  )
  const unknown = {
    ...models[0]!,
    session: { ...models[0]!.session, id: 'unknown', status: 'idle' as const },
    working: false,
    attentionGroup: null,
    summary: 'Tasks unknown',
  }
  const result = buildFeedView(
    groupNeedsYou([dismissed, unknown]),
    defaultFeedView(),
  )
  expect(result.activityCounts).toEqual({
    all: 2,
    'needs-me': 0,
    working: 0,
    review: 0,
  })
  const tasks = { ...unknown, working: true }
  expect(
    buildFeedView(groupNeedsYou([tasks]), defaultFeedView()).activityCounts
      .working,
  ).toBe(1)
})

it('never duplicates cards or narrows the feed to a project', () => {
  const extra = {
    ...models[0]!,
    session: { ...models[0]!.session, id: 'other-project', projectId: 'other' },
  }
  const groups = [...source, { title: 'Repeated', cards: [models[0]!, extra] }]
  expect(buildFeedView(groups, defaultFeedView()).total).toBe(8)
})

it('resets legacy advanced filters and validates persisted simple selections', () => {
  for (const raw of [
    '{',
    'null',
    '[]',
    JSON.stringify({
      query: 'missing',
      filters: { project: ['hidden'] },
      sort: 'name',
      pinsFirst: false,
    }),
  ]) {
    expect(readFeedView(raw)).toEqual(defaultFeedView())
  }
  expect(
    readFeedView(
      JSON.stringify({
        version: 2,
        activity: 'working',
        hosts: ['remote', 'remote', 'bad'],
        providers: ['openai', 'openai', null, ''],
        query: 'hidden',
      }),
    ),
  ).toEqual({
    version: 2,
    activity: 'working',
    hosts: ['remote'],
    providers: ['openai'],
  })
  expect(
    readFeedView(
      JSON.stringify({ version: 2, activity: {}, hosts: 12, providers: true }),
    ),
  ).toEqual(defaultFeedView())
  const view = {
    ...defaultFeedView(),
    activity: 'review' as const,
    hosts: ['remote' as const],
    providers: ['openai'],
  }
  expect(readFeedView(JSON.stringify(view))).toEqual(view)
})

it('toggles a choice without mutating the previous selection', () => {
  const previous = ['openai']
  expect(toggleFeedChoice(previous, 'anthropic')).toEqual([
    'openai',
    'anthropic',
  ])
  expect(toggleFeedChoice(previous, 'openai')).toEqual([])
  expect(previous).toEqual(['openai'])
})

it('holds interaction order while applying live data, removals and arrivals', () => {
  const a = models[0]!,
    b = models[2]!
  const previous = [{ title: 'Working', cards: [a, b] }]
  const current = [
    {
      title: 'Working',
      cards: [
        { ...b, lastMoved: 'live' },
        { ...a, lastMoved: 'live' },
      ],
    },
  ]
  const held = holdFeedOrder(current, previous)
  expect(held[0]!.cards.map((card) => card.session.id)).toEqual([
    'pin',
    'working',
  ])
  expect(held[0]!.cards.every((card) => card.lastMoved === 'live')).toBe(true)
  expect(feedOrderKey(held)).not.toBe(feedOrderKey(current))
  expect(holdFeedOrder(current, null)).toBe(current)
  const removed = holdFeedOrder([{ title: 'Working', cards: [b] }], previous)
  expect(removed[0]!.cards.map((card) => card.session.id)).toEqual(['working'])
})
