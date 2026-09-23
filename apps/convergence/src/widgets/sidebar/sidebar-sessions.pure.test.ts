import { describe, expect, it } from 'vitest'
import type { SessionSummary } from '@/entities/session'
import {
  sameForSidebar,
  sameSidebarList,
  sidebarCards,
} from './sidebar-sessions.pure'

const base = {
  id: 'b',
  name: 'B',
  contextKind: 'project',
  projectId: 'p1',
  workspaceId: null,
  providerId: 'codex',
  model: 'gpt',
  effort: null,
  status: 'running',
  attention: 'none',
  activity: 'streaming',
  contextWindow: { usedTokens: 10, windowTokens: 100 },
  workingDirectory: '/tmp',
  archivedAt: null,
  parentSessionId: null,
  forkStrategy: null,
  primarySurface: 'conversation',
  executionHost: 'local',
  continuationToken: null,
  lastSequence: 3,
  createdAt: '2026-09-24T09:00:00.000Z',
  updatedAt: '2026-09-24T10:00:00.000Z',
  pinnedAt: null,
  pullRequest: { number: 7, state: 'open', url: 'https://x/7' },
  turnTiming: {
    turnId: 't1',
    startedAt: '2026-09-24T09:59:00.000Z',
    endedAt: null,
    status: 'running',
  },
  parallelWork: { running: 1, unknown: 0, failed: 0, stopped: 0 },
} as unknown as SessionSummary

/** A structurally fresh copy, as every summary that crosses IPC is. */
const fresh = (partial: Record<string, unknown> = {}): SessionSummary =>
  ({ ...structuredClone(base), ...partial }) as SessionSummary

describe('MAR-3378 F1b sameForSidebar', () => {
  it('a fresh copy that differs in nothing is the same (nested values by value)', () => {
    expect(sameForSidebar(base, fresh())).toBe(true)
  })

  it.each([
    ['updatedAt', '2026-09-24T10:00:00.050Z'],
    ['executionHostLastEventAt', '2026-09-24T10:00:00.050Z'],
    ['executionHostLastSeq', 42],
    ['lastSequence', 4],
    ['contextWindow', { usedTokens: 11, windowTokens: 100 }],
  ])('ignores %s — read on the clock, or never', (field, value) => {
    expect(sameForSidebar(base, fresh({ [field]: value }))).toBe(true)
  })

  it.each([
    ['status', 'completed'],
    ['attention', 'finished'],
    ['attentionRequestKind', 'approval'],
    ['activity', 'tool:Read'],
    ['name', 'Renamed'],
    ['pinnedAt', '2026-09-24T10:00:01.000Z'],
    ['archivedAt', '2026-09-24T10:00:01.000Z'],
    ['executionHost', 'daemon-1'],
    ['hasActiveHandle', false],
    ['originKind', 'spawn'],
    ['pullRequest', { number: 7, state: 'merged', url: 'https://x/7' }],
    [
      'turnTiming',
      {
        turnId: 't1',
        startedAt: '2026-09-24T09:59:00.000Z',
        endedAt: '2026-09-24T10:00:01.000Z',
        status: 'completed',
      },
    ],
    ['parallelWork', { running: 2, unknown: 0, failed: 0, stopped: 0 }],
  ])('sees %s — shown at once', (field, value) => {
    expect(sameForSidebar(base, fresh({ [field]: value }))).toBe(false)
  })

  it('a field that appears or disappears is a change; undefined equals absent', () => {
    expect(sameForSidebar(base, fresh({ pullRequest: undefined }))).toBe(false)
    const withoutPin = fresh() as unknown as Record<string, unknown>
    delete withoutPin.pinnedAt
    expect(
      sameForSidebar(
        fresh({ pinnedAt: undefined }),
        withoutPin as unknown as SessionSummary,
      ),
    ).toBe(true)
  })
})

describe('MAR-3378 F1b sameSidebarList', () => {
  const other = fresh({ id: 'c', name: 'C' })
  it('same conversations in the same order, only clock fields moved → same', () => {
    expect(
      sameSidebarList(
        [base, other],
        [fresh({ updatedAt: '2026-09-24T11:00:00.000Z' }), other],
      ),
    ).toBe(true)
  })
  it('a reorder, an insert or a removal is a change', () => {
    expect(sameSidebarList([base, other], [other, base])).toBe(false)
    expect(sameSidebarList([base], [base, other])).toBe(false)
    expect(sameSidebarList([base, other], [base])).toBe(false)
  })
})

describe('MAR-3378 F1b sidebarCards', () => {
  const now = Date.parse('2026-09-24T10:01:00.000Z')
  it('one card per conversation, in order, project names by id', () => {
    const cards = sidebarCards(
      [
        base,
        fresh({ id: 'g', contextKind: 'global', projectId: null }),
        fresh({ id: 'x', projectId: 'gone' }),
      ],
      {
        projects: [{ id: 'p1', name: 'Repo' }],
        endpoints: [],
        now,
        dismissals: {},
      },
    )
    expect(cards.map((card) => [card.session.id, card.projectName])).toEqual([
      ['b', 'Repo'],
      ['g', 'Convergence'],
      ['x', 'Unknown project'],
    ])
  })
  it('a dismissal holds only while its stamp matches the conversation', () => {
    const context = {
      projects: [{ id: 'p1', name: 'Repo' }],
      endpoints: [],
      now,
    }
    const [held] = sidebarCards([base], {
      ...context,
      dismissals: {
        b: { updatedAt: base.updatedAt, disposition: 'acknowledged' },
      },
    })
    const [moved] = sidebarCards([base], {
      ...context,
      dismissals: {
        b: { updatedAt: '2026-09-24T09:00:00.000Z', disposition: 'snoozed' },
      },
    })
    expect(held.dismissed).toBe(true)
    expect(moved.dismissed).toBe(false)
  })
})
