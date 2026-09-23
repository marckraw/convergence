import type { NeedsYouCardModel } from './needs-you-card.pure'

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
  /** The section's one line, or null when its kind has nothing to say. */
  line: string | null
}

function countLine(counts: Map<FoldCardState, number>, only?: FoldCardState[]) {
  const parts = STATE_ORDER.filter(
    (state) => (!only || only.includes(state)) && counts.get(state),
  ).map((state) => `${counts.get(state)} ${STATE_WORDS[state]}`)
  return parts.length ? parts.join(' · ') : null
}

/**
 * What a folded feed section still says about the cards it hides (MAR-3366
 * R4): the count, one glyph per card, and one line chosen by the section's
 * kind. Read only from the cards the section renders, never the whole feed.
 */
export function foldedSectionSummary(
  title: string,
  cards: readonly NeedsYouCardModel[],
): FoldedSectionSummary {
  const states = cards.map(foldCardState)
  const counts = new Map<FoldCardState, number>()
  for (const state of states) counts.set(state, (counts.get(state) ?? 0) + 1)
  let line: string | null = null
  if (title === 'Pinned') line = countLine(counts)
  else if (title === 'Needs attention')
    line = countLine(counts, ['waiting', 'failed'])
  else if (title === 'Review') {
    const prs = cards.filter((card) => card.session.pullRequest).length
    line = prs ? `${prs} ${prs === 1 ? 'PR' : 'PRs'}` : null
  } else if (title === 'Working') {
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
  }
}
