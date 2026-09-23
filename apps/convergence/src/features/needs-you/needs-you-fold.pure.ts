import type { NeedsYouCardModel } from './needs-you-card.pure'
import { pullRequestPresentation } from './pull-request-presentation.pure'

/**
 * The state a card's status line shows, in the status line's own precedence
 * (`needs-you-card-status.presentational.tsx`): unreachable, waiting, failed,
 * working, then settled. `idle` is a card with no status line at all.
 */
export type FoldCardState =
  | 'unreachable'
  | 'waiting'
  | 'failed'
  | 'working'
  | 'unknown'
  | 'finished'
  | 'idle'

export function foldCardState(card: NeedsYouCardModel): FoldCardState {
  if (card.hostUnreachable) return 'unreachable'
  if (card.attentionGroup === 'Waiting on you') return 'waiting'
  if (card.session.attention === 'failed' || card.session.status === 'failed')
    return 'failed'
  if (card.working) return 'working'
  if (!card.summary) return 'idle'
  if (card.session.parallelWork?.unknown) return 'unknown'
  return 'finished'
}

const STATE_WORDS: Readonly<Record<FoldCardState, string>> = {
  waiting: 'waiting on you',
  failed: 'failed',
  working: 'working',
  unreachable: 'host unreachable',
  unknown: 'unknown',
  finished: 'finished',
  idle: 'idle',
}
/** The reading order of a states-in-words line: what asks first. */
const STATE_ORDER = Object.keys(STATE_WORDS) as FoldCardState[]

/** The states that ask something of Marcin, in `STATE_ORDER` (MAR-3372). */
export type FoldAskState = Extract<
  FoldCardState,
  'waiting' | 'failed' | 'unreachable'
>
const ASK_STATES = STATE_ORDER.filter(
  (state): state is FoldAskState =>
    state === 'waiting' || state === 'failed' || state === 'unreachable',
)

/** At most this many project names on a folded line; the rest is a `+N`. */
export const FOLD_PROJECT_LIMIT = 3

type PullRequestState = ReturnType<typeof pullRequestPresentation>['state']
/** The reading order of a folded Review's PR states: what still asks first. */
const PR_STATE_RANK: Readonly<Record<PullRequestState, number>> = {
  'changes-requested': 0,
  ready: 1,
  draft: 2,
  approved: 3,
  merged: 4,
  closed: 5,
}

/** At most this many glyphs; the rest is a `+N`. */
export const FOLD_GLYPH_LIMIT = 6

export interface FoldGlyph {
  sessionId: string
  providerId: string
  name: string
  state: FoldCardState
}

export interface FoldedSectionSummary {
  count: number
  glyphs: FoldGlyph[]
  /** Cards past the glyph limit, drawn as `+N`; 0 draws nothing. */
  overflow: number
  /** Every card's conversation name, in section order, for the tooltip. */
  names: string[]
  /**
   * The section's kind line, or null when its kind has nothing to say. Never
   * repeats a state already said by `asks` (MAR-3372 R4).
   */
  line: string | null
  /** Waiting / failed / unreachable counts in `STATE_ORDER`; empty when none. */
  asks: FoldAsk[]
  /** The most urgent asking state — the folded title's tone — or null. */
  urgent: FoldAskState | null
  /** The distinct project names of the section's cards (MAR-3372 R3). */
  projects: FoldProjects
}

export interface FoldAsk {
  state: FoldAskState
  count: number
  /** `1 waiting on you`, `2 failed`. */
  text: string
}

export interface FoldProjects {
  /** The first `FOLD_PROJECT_LIMIT` distinct names, in section order. */
  shown: string[]
  /** Distinct names past the limit, drawn as `+N`; 0 draws nothing. */
  more: number
  /** `a, b, c +2`, or null for a section without cards. */
  text: string | null
}

/** A states-in-words line that never says a state the asks already said. */
function countLine(counts: Map<FoldCardState, number>) {
  const parts = STATE_ORDER.filter(
    (state) =>
      !(ASK_STATES as FoldCardState[]).includes(state) && counts.get(state),
  ).map((state) => `${counts.get(state)} ${STATE_WORDS[state]}`)
  return parts.length ? parts.join(' · ') : null
}

/** `N PRs` then each PR state in the card's own presentation words (R2). */
function reviewLine(cards: readonly NeedsYouCardModel[]): string | null {
  const counts = new Map<PullRequestState, { count: number; words: string }>()
  for (const card of cards) {
    const pr = card.session.pullRequest
    if (!pr) continue
    const { state, label } = pullRequestPresentation(pr)
    const seen = counts.get(state)
    counts.set(state, {
      count: (seen?.count ?? 0) + 1,
      words: label.toLowerCase(),
    })
  }
  const total = [...counts.values()].reduce((sum, { count }) => sum + count, 0)
  if (!total) return null
  const states = [...counts]
    .sort(([a], [b]) => PR_STATE_RANK[a] - PR_STATE_RANK[b])
    .map(([, { count, words }]) => `${count} ${words}`)
  return [`${total} ${total === 1 ? 'PR' : 'PRs'}`, ...states].join(' · ')
}

function foldProjects(cards: readonly NeedsYouCardModel[]): FoldProjects {
  const distinct = [...new Set(cards.map((card) => card.projectName))]
  const shown = distinct.slice(0, FOLD_PROJECT_LIMIT)
  const more = distinct.length - shown.length
  return {
    shown,
    more,
    text: shown.length
      ? `${shown.join(', ')}${more > 0 ? ` +${more}` : ''}`
      : null,
  }
}

/**
 * What a folded feed section still says about the cards it hides (MAR-3366
 * R4): the count, one glyph per card, and one line chosen by the section's
 * kind. MAR-3372 adds what asks for Marcin (and so the title's tone) and the
 * projects inside. Read only from the cards the section renders, never the
 * whole feed.
 */
export function foldedSectionSummary(
  title: string,
  cards: readonly NeedsYouCardModel[],
): FoldedSectionSummary {
  const states = cards.map(foldCardState)
  const counts = new Map<FoldCardState, number>()
  for (const state of states) counts.set(state, (counts.get(state) ?? 0) + 1)
  let line: string | null = null
  // Needs attention has no kind line of its own: every state it said
  // (waiting, failed) is an ask now, and `asks` says it once (MAR-3372 R4).
  if (title === 'Pinned') line = countLine(counts)
  else if (title === 'Review') line = reviewLine(cards)
  else if (title === 'Working') {
    const longest = cards.reduce<{ seconds: number; text: string } | null>(
      (best, card) => {
        const running = card.timing.running
        return running && (!best || running.seconds > best.seconds)
          ? running
          : best
      },
      null,
    )
    line = longest ? `longest ${longest.text}` : null
  }
  const asks = ASK_STATES.filter((state) => counts.get(state)).map((state) => ({
    state,
    count: counts.get(state)!,
    text: `${counts.get(state)} ${STATE_WORDS[state]}`,
  }))
  return {
    count: cards.length,
    glyphs: cards.slice(0, FOLD_GLYPH_LIMIT).map((card, index) => ({
      sessionId: card.session.id,
      providerId: card.session.providerId,
      name: card.session.name,
      state: states[index]!,
    })),
    overflow: Math.max(0, cards.length - FOLD_GLYPH_LIMIT),
    names: cards.map((card) => card.session.name),
    line,
    asks,
    urgent: asks[0]?.state ?? null,
    projects: foldProjects(cards),
  }
}
