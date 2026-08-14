import { describe, expect, it } from 'vitest'
import type {
  ActivitySignal,
  AttentionState,
  SessionStatus,
  SessionSummary,
} from '@/entities/session'
import type { SessionCard } from './mission-control.types'
import {
  SESSION_CARD_STATES,
  classifySessionCardState,
  countSessionCardStates,
  formatSessionCardState,
} from './session-card-state.pure'

const STATUSES: SessionStatus[] = ['idle', 'running', 'completed', 'failed']
const ATTENTIONS: AttentionState[] = [
  'none',
  'needs-input',
  'needs-approval',
  'finished',
  'failed',
]
const ACTIVITIES: ActivitySignal[] = [
  null,
  'streaming',
  'thinking',
  'compacting',
  'waiting-approval',
  'tool:Bash',
]

const BLOCKING_ATTENTIONS: AttentionState[] = ['needs-input', 'needs-approval']
const LIVE_ACTIVITIES: ActivitySignal[] = [
  'streaming',
  'thinking',
  'compacting',
  'tool:Bash',
]

function makeCard(overrides: {
  status: SessionStatus
  attention: AttentionState
  activity: ActivitySignal
}): SessionCard {
  return {
    session: { id: 'card', ...overrides } as SessionSummary,
    projectName: 'Convergence',
    providerLabel: 'Anthropic',
    activityLabel: 'idle',
    searchText: 'card',
  }
}

/** Every status × attention × activity a Session Summary can carry. */
const MATRIX = STATUSES.flatMap((status) =>
  ATTENTIONS.flatMap((attention) =>
    ACTIVITIES.map((activity) => ({ status, attention, activity })),
  ),
)

describe('classifySessionCardState', () => {
  it('answers for every status × attention × activity combination', () => {
    expect(MATRIX).toHaveLength(
      STATUSES.length * ATTENTIONS.length * ACTIVITIES.length,
    )

    for (const combination of MATRIX) {
      expect(SESSION_CARD_STATES).toContain(
        classifySessionCardState(makeCard(combination)),
      )
    }
  })

  it('calls every blocked session needs-you, whatever else it says', () => {
    const blocked = MATRIX.filter((combination) =>
      BLOCKING_ATTENTIONS.includes(combination.attention),
    )
    expect(blocked).not.toHaveLength(0)

    for (const combination of blocked) {
      expect(classifySessionCardState(makeCard(combination))).toBe('needs-you')
    }
  })

  it('calls a live approval prompt needs-you before attention catches up', () => {
    for (const status of STATUSES) {
      expect(
        classifySessionCardState(
          makeCard({ status, attention: 'none', activity: 'waiting-approval' }),
        ),
      ).toBe('needs-you')
    }
  })

  it('calls every unblocked running session working', () => {
    const running = MATRIX.filter(
      (combination) =>
        combination.status === 'running' &&
        !BLOCKING_ATTENTIONS.includes(combination.attention) &&
        combination.activity !== 'waiting-approval',
    )
    expect(running).not.toHaveLength(0)

    for (const combination of running) {
      expect(classifySessionCardState(makeCard(combination))).toBe('working')
    }
  })

  it('lets live movement outrank a stale outcome flag', () => {
    for (const activity of LIVE_ACTIVITIES) {
      for (const attention of ['finished', 'failed'] as AttentionState[]) {
        expect(
          classifySessionCardState(
            makeCard({ status: 'idle', attention, activity }),
          ),
        ).toBe('working')
      }
    }
  })

  it('reads the unread outcome of a quiet session', () => {
    for (const status of ['idle', 'completed'] as SessionStatus[]) {
      expect(
        classifySessionCardState(
          makeCard({ status, attention: 'finished', activity: null }),
        ),
      ).toBe('finished')
    }

    for (const status of ['idle', 'completed', 'failed'] as SessionStatus[]) {
      expect(
        classifySessionCardState(
          makeCard({ status, attention: 'failed', activity: null }),
        ),
      ).toBe('failed')
    }
  })

  it('never hides a failed run behind a finished flag', () => {
    expect(
      classifySessionCardState(
        makeCard({ status: 'failed', attention: 'finished', activity: null }),
      ),
    ).toBe('failed')
  })

  it('falls back to the status of a quiet, unflagged session', () => {
    const expected: Record<string, string> = {
      idle: 'idle',
      completed: 'finished',
      failed: 'failed',
    }

    for (const [status, state] of Object.entries(expected)) {
      expect(
        classifySessionCardState(
          makeCard({
            status: status as SessionStatus,
            attention: 'none',
            activity: null,
          }),
        ),
      ).toBe(state)
    }
  })

  it('keeps an acknowledged failure failed and an acknowledged finish finished', () => {
    expect(
      classifySessionCardState(
        makeCard({ status: 'failed', attention: 'none', activity: null }),
      ),
    ).toBe('failed')
    expect(
      classifySessionCardState(
        makeCard({ status: 'completed', attention: 'none', activity: null }),
      ),
    ).toBe('finished')
  })

  it('accounts for the whole matrix with those rules and no others', () => {
    for (const combination of MATRIX) {
      const state = classifySessionCardState(makeCard(combination))
      const { status, attention, activity } = combination

      const expected = BLOCKING_ATTENTIONS.includes(attention)
        ? 'needs-you'
        : activity === 'waiting-approval'
          ? 'needs-you'
          : status === 'running' || activity !== null
            ? 'working'
            : attention === 'failed' || status === 'failed'
              ? 'failed'
              : attention === 'finished' || status === 'completed'
                ? 'finished'
                : 'idle'

      expect({ ...combination, state }).toEqual({
        ...combination,
        state: expected,
      })
    }
  })
})

describe('countSessionCardStates', () => {
  it('counts an empty room as zero everywhere', () => {
    expect(countSessionCardStates([])).toEqual({
      working: 0,
      'needs-you': 0,
      idle: 0,
      finished: 0,
      failed: 0,
    })
  })

  it('counts each card once, into its own state', () => {
    const counts = countSessionCardStates([
      makeCard({ status: 'running', attention: 'none', activity: 'streaming' }),
      makeCard({ status: 'running', attention: 'none', activity: null }),
      makeCard({ status: 'idle', attention: 'needs-approval', activity: null }),
      makeCard({ status: 'completed', attention: 'finished', activity: null }),
      makeCard({ status: 'failed', attention: 'failed', activity: null }),
      makeCard({ status: 'idle', attention: 'none', activity: null }),
    ])

    expect(counts).toEqual({
      working: 2,
      'needs-you': 1,
      idle: 1,
      finished: 1,
      failed: 1,
    })
  })

  it('always totals the number of cards it was given', () => {
    const cards = MATRIX.map(makeCard)
    const counts = countSessionCardStates(cards)

    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(
      cards.length,
    )
  })
})

describe('formatSessionCardState', () => {
  it('labels every state in the room voice', () => {
    expect(SESSION_CARD_STATES.map(formatSessionCardState)).toEqual([
      'Working',
      'Needs you',
      'Idle',
      'Finished',
      'Failed',
    ])
  })
})
