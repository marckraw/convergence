import { expect, it } from 'vitest'
import { cardContext, cardSession } from './needs-you-card.fixture'
import {
  needsYouCardModel,
  type NeedsYouCardModel,
} from './needs-you-card.pure'
import { foldCardState, foldedSectionSummary } from './needs-you-fold.pure'

const now = cardContext.now
const minutesAgo = (minutes: number) =>
  new Date(now - minutes * 60_000).toISOString()
/** A running turn with a live handle, started `minutes` before the clock. */
function running(id: string, minutes: number, providerId = 'codex') {
  return needsYouCardModel(
    cardSession({
      id,
      name: `Horse ${id}`,
      providerId,
      status: 'running',
      hasActiveHandle: true,
      turnTiming: {
        status: 'running',
        startedAt: minutesAgo(minutes),
        endedAt: null,
      },
    } as Parameters<typeof cardSession>[0]),
    cardContext,
  )
}
const pr = {
  number: 7,
  state: 'open',
  url: 'https://github.com/acme/app/pull/7',
  headBranch: 'horse',
  checkedAt: '2026-09-12T12:00:00Z',
  source: 'gh',
} as const
const finished = (id: string, withPr = false) =>
  needsYouCardModel(
    cardSession({
      id,
      name: `Review ${id}`,
      attention: 'finished',
      status: 'completed',
      ...(withPr ? { pullRequest: { ...pr, number: Number(id.length) } } : {}),
    }),
    cardContext,
  )

it('MAR-3366 R4 folded Working: the count, one glyph per card and the longest current turn', () => {
  const cards = [
    running('a', 3),
    running('b', 52, 'claude-code'),
    running('c', 12),
    running('d', 1, 'claude-code'),
  ]
  const summary = foldedSectionSummary('Working', cards)
  expect(summary.count).toBe(4)
  expect(summary.glyphs.map((glyph) => glyph.providerId)).toEqual([
    'codex',
    'claude-code',
    'codex',
    'claude-code',
  ])
  expect(summary.glyphs.every((glyph) => glyph.state === 'working')).toBe(true)
  expect(summary.overflow).toBe(0)
  // The same text the longest card prints, never a second format.
  expect(cards[1]!.timing.label).toBe('· 52m 0s')
  expect(summary.line).toBe('longest 52m 0s')
  expect(summary.names).toEqual(['Horse a', 'Horse b', 'Horse c', 'Horse d'])
})

it('MAR-3366 R4 caps the strip at six glyphs and counts the rest', () => {
  const cards = Array.from({ length: 9 }, (_, index) =>
    running(String(index), index + 1),
  )
  const summary = foldedSectionSummary('Working', cards)
  expect(summary.count).toBe(9)
  expect(summary.glyphs).toHaveLength(6)
  expect(summary.overflow).toBe(3)
  expect(summary.names).toHaveLength(9)
  expect(summary.line).toBe('longest 9m 0s')
})

it('MAR-3366 R4 a Working section with no live timing says nothing rather than a guess', () => {
  const card = needsYouCardModel(
    cardSession({ id: 'w', status: 'running' }),
    cardContext,
  )
  expect(card.timing.label).toBeNull()
  expect(foldedSectionSummary('Working', [card]).line).toBeNull()
})

it('MAR-3366 R4 folded Review counts its PRs, and says nothing without one', () => {
  expect(
    foldedSectionSummary('Review', [
      finished('x', true),
      finished('yy', true),
      finished('z'),
    ]).line,
  ).toBe('2 PRs · 2 ready for review')
  expect(foldedSectionSummary('Review', [finished('x', true)]).line).toBe(
    '1 PR · 1 ready for review',
  )
  expect(foldedSectionSummary('Review', [finished('z')]).line).toBeNull()
})

it('MAR-3366 R4 folded Needs attention and Pinned say their states in words', () => {
  const waiting = needsYouCardModel(
    cardSession({ id: 'w1', attention: 'needs-input' }),
    cardContext,
  )
  const approval = needsYouCardModel(
    cardSession({ id: 'w2', attention: 'needs-approval' }),
    cardContext,
  )
  const failed = needsYouCardModel(
    cardSession({ id: 'f', attention: 'failed', status: 'failed' }),
    cardContext,
  )
  // MAR-3372 R4: waiting and failed are asks now — said once, by `asks`.
  const attention = (cards: NeedsYouCardModel[]) => {
    const summary = foldedSectionSummary('Needs attention', cards)
    return [summary.line, summary.asks.map((ask) => ask.text).join(' · ')]
  }
  expect(attention([waiting, approval])).toEqual([null, '2 waiting on you'])
  expect(attention([waiting, failed])).toEqual([
    null,
    '1 waiting on you · 1 failed',
  ])
  expect(
    foldedSectionSummary('Pinned', [running('p1', 4), finished('p2')]).line,
  ).toBe('1 working · 1 finished')
})

it('MAR-3366 R4 reads a card state in the status line precedence', () => {
  expect(
    foldCardState(
      needsYouCardModel(
        cardSession({ attention: 'host-unreachable', status: 'running' }),
        cardContext,
      ),
    ),
  ).toBe('unreachable')
  expect(foldCardState(running('r', 2))).toBe('working')
  expect(foldCardState(finished('d'))).toBe('finished')
  expect(foldCardState(needsYouCardModel(cardSession({}), cardContext))).toBe(
    'idle',
  )
})

it('MAR-3366 R4 summarises only the cards it is given — the section, not the feed', () => {
  const section = [running('a', 5)]
  const summary = foldedSectionSummary('Working', section)
  expect(summary.count).toBe(1)
  expect(summary.names).toEqual(['Horse a'])
})

const card = (
  id: string,
  overrides: Parameters<typeof cardSession>[0] = {},
  projectName = cardContext.projectName,
) =>
  needsYouCardModel(cardSession({ id, name: id, ...overrides }), {
    ...cardContext,
    projectName,
  })
const reviewWith = (id: string, pullRequest: Record<string, unknown>) =>
  card(id, {
    attention: 'finished',
    status: 'completed',
    pullRequest: { ...pr, number: id.length, ...pullRequest },
  } as Parameters<typeof cardSession>[0])

it('MAR-3372 R2 folded Review counts its PRs by the card presentation state — mutation: count pr.state instead turns red', () => {
  const cards = [
    reviewWith('a', { reviewDecision: 'APPROVED' }),
    reviewWith('bb', { reviewDecision: 'APPROVED' }),
    reviewWith('ccc', { state: 'merged' }),
  ]
  expect(foldedSectionSummary('Review', cards).line).toBe(
    '3 PRs · 2 approved · 1 merged',
  )
  // What still asks reads first, whatever order the cards arrive in.
  expect(
    foldedSectionSummary('Review', [
      reviewWith('m', { state: 'merged' }),
      reviewWith('cr', { reviewDecision: 'CHANGES_REQUESTED' }),
      card('none', { attention: 'finished', status: 'completed' }),
    ]).line,
  ).toBe('2 PRs · 1 changes requested · 1 merged')
  expect(
    foldedSectionSummary('Review', [
      card('none', { attention: 'finished', status: 'completed' }),
    ]).line,
  ).toBeNull()
})

it('MAR-3372 R3 a fold names its projects distinct, in section order, three then +N — mutation: drop the de-dup turns red', () => {
  const cards = ['a', 'b', 'a', 'c', 'd', 'e'].map((project, index) =>
    card(String(index), { status: 'running' }, project),
  )
  expect(foldedSectionSummary('Working', cards).projects).toEqual({
    shown: ['a', 'b', 'c'],
    more: 2,
    text: 'a, b, c +2',
  })
  expect(
    foldedSectionSummary('Working', [
      card('1', {}, 'solo'),
      card('2', {}, 'solo'),
    ]).projects.text,
  ).toBe('solo')
  expect(foldedSectionSummary('Working', []).projects.text).toBeNull()
})

it('MAR-3372 R4 a fold says what asks, most urgent first, and never says a state twice — mutation: keep failed in the Pinned kind line turns red', () => {
  const waiting = card('w', { attention: 'needs-input' })
  const failed = card('f', { attention: 'failed', status: 'failed' })
  const unreachable = card('u', {
    attention: 'host-unreachable',
    status: 'running',
  })
  const pinned = foldedSectionSummary('Pinned', [
    failed,
    running('r', 4),
    unreachable,
    waiting,
    finished('d'),
  ])
  expect(pinned.asks).toEqual([
    { state: 'waiting', count: 1, text: '1 waiting on you' },
    { state: 'failed', count: 1, text: '1 failed' },
    { state: 'unreachable', count: 1, text: '1 host unreachable' },
  ])
  expect(pinned.urgent).toBe('waiting')
  expect(pinned.line).toBe('1 working · 1 finished')
  const said = [...pinned.asks.map((ask) => ask.text), pinned.line!]
    .join(' · ')
    .split(' · ')
    .map((part) => part.replace(/^\d+ /, ''))
  expect(new Set(said).size).toBe(said.length)

  const review = foldedSectionSummary('Review', [failed, finished('d')])
  expect(review.asks.map((ask) => ask.text)).toEqual(['1 failed'])
  expect(review.urgent).toBe('failed')
  expect(foldedSectionSummary('Working', [running('r', 2)]).urgent).toBeNull()
  expect(foldedSectionSummary('Working', [running('r', 2)]).asks).toEqual([])
})
