import type { SessionCard } from './mission-control.types'
import { classifySessionCardState } from './session-card-state.pure'
import type { SessionCardState } from './session-card-state.pure'

export const SESSION_CARD_GROUP_BLOCKED = 0
export const SESSION_CARD_GROUP_REVIEW = 1
export const SESSION_CARD_GROUP_RUNNING = 2
export const SESSION_CARD_GROUP_RESTING = 3

/**
 * How Marcin wants the room laid out. `attention-first` is the default and the
 * original behavior; the others are lenses on the same cards, never filters.
 */
export type SessionCardOrderPreset =
  | 'attention-first'
  | 'working-first'
  | 'recent-first'
  | 'by-project'

export const SESSION_CARD_ORDER_PRESETS: readonly SessionCardOrderPreset[] = [
  'attention-first',
  'working-first',
  'recent-first',
  'by-project',
]

const SESSION_CARD_ORDER_PRESET_LABELS: Record<SessionCardOrderPreset, string> =
  {
    'attention-first': 'Attention first',
    'working-first': 'Working first',
    'recent-first': 'Recent first',
    'by-project': 'By project',
  }

export function formatSessionCardOrderPreset(
  preset: SessionCardOrderPreset,
): string {
  return SESSION_CARD_ORDER_PRESET_LABELS[preset]
}

/**
 * Which band of the room a card belongs to. Agents that cannot move without
 * Marcin come first, then agents whose work is done and unread, then agents
 * still working, then everything at rest.
 */
export function getSessionCardGroup(card: SessionCard): number {
  switch (card.session.attention) {
    case 'needs-approval':
    case 'needs-input':
      return SESSION_CARD_GROUP_BLOCKED
    case 'failed':
    case 'finished':
      return SESSION_CARD_GROUP_REVIEW
    default:
      return card.session.status === 'running'
        ? SESSION_CARD_GROUP_RUNNING
        : SESSION_CARD_GROUP_RESTING
  }
}

/** Working on top, then whoever is blocked, then outcomes, then rest. */
const WORKING_FIRST_RANK: Record<SessionCardState, number> = {
  working: 0,
  'needs-you': 1,
  failed: 2,
  finished: 3,
  idle: 4,
}

function getWorkingFirstRank(card: SessionCard): number {
  return WORKING_FIRST_RANK[classifySessionCardState(card)]
}

function compareRecency(left: SessionCard, right: SessionCard): number {
  const delta =
    Date.parse(right.session.updatedAt) - Date.parse(left.session.updatedAt)
  return delta !== 0 && Number.isFinite(delta) ? delta : 0
}

function compareProjectName(left: SessionCard, right: SessionCard): number {
  return left.projectName.localeCompare(right.projectName, undefined, {
    sensitivity: 'base',
  })
}

/**
 * The comparators behind each preset, applied in order until one decides.
 * Recency and the incoming index are appended to every preset by
 * `orderSessionCards`, so each list here only carries what makes it distinct.
 */
const PRESET_COMPARATORS: Record<
  SessionCardOrderPreset,
  ReadonlyArray<(left: SessionCard, right: SessionCard) => number>
> = {
  'attention-first': [
    (left, right) => getSessionCardGroup(left) - getSessionCardGroup(right),
  ],
  'working-first': [
    (left, right) => getWorkingFirstRank(left) - getWorkingFirstRank(right),
  ],
  'recent-first': [],
  'by-project': [
    compareProjectName,
    (left, right) => getSessionCardGroup(left) - getSessionCardGroup(right),
  ],
}

/**
 * Lays the room out under the chosen preset. Every preset falls back to
 * recency and then to the incoming order, so ordering is always total and
 * stable — cards that tie all the way down never shuffle between renders.
 */
export function orderSessionCards(
  cards: readonly SessionCard[],
  preset: SessionCardOrderPreset = 'attention-first',
): SessionCard[] {
  const comparators = PRESET_COMPARATORS[preset] ?? []

  return cards
    .map((card, index) => ({ card, index }))
    .sort((left, right) => {
      for (const compare of comparators) {
        const delta = compare(left.card, right.card)
        if (delta !== 0) return delta
      }

      const recencyDelta = compareRecency(left.card, right.card)
      if (recencyDelta !== 0) return recencyDelta

      return left.index - right.index
    })
    .map((entry) => entry.card)
}
