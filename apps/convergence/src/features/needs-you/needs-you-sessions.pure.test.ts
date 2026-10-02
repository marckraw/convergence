import { describe, expect, it } from 'vitest'
import type { NeedsYouDismissals, SessionSummary } from '@/entities/session'
import {
  needsYouSessions,
  needsYouTone,
  waitsOnYou,
} from './needs-you-sessions.pure'

type Row = Pick<
  SessionSummary,
  'id' | 'attention' | 'status' | 'archivedAt' | 'updatedAt'
>

const row = (id: string, partial: Partial<Row> = {}): Row => ({
  id,
  attention: 'none',
  status: 'idle',
  archivedAt: null,
  updatedAt: '2026-10-02T09:00:00.000Z',
  ...partial,
})

describe('what waits on you (ruling 6)', () => {
  it.each([
    ['an approval', { attention: 'needs-approval' }, true],
    ['an input request', { attention: 'needs-input' }, true],
    ['a failed run', { attention: 'failed', status: 'failed' }, true],
    ['a failed status alone', { status: 'failed' }, true],
    ['finished work waiting for review', { attention: 'finished' }, false],
    ['a running turn', { status: 'running' }, false],
    [
      'a run on a host the app cannot reach, whatever its last status',
      { attention: 'host-unreachable', status: 'failed' },
      false,
    ],
  ] as const)('%s: %s', (_name, partial, expected) => {
    expect(waitsOnYou(row('s', partial))).toBe(expected)
  })
})

describe('needsYouSessions, the one count behind "N need you" (NAV-32 N1)', () => {
  const approval = row('approval', { attention: 'needs-approval' })
  const input = row('input', { attention: 'needs-input' })
  const failed = row('failed', { attention: 'failed', status: 'failed' })
  const finished = row('finished', {
    attention: 'finished',
    status: 'completed',
  })
  const archived = row('archived', {
    attention: 'needs-input',
    archivedAt: '2026-10-01T00:00:00.000Z',
  })

  it('counts approvals, input requests and failed runs, and nothing finished or archived (mutation: count finished turns red)', () => {
    expect(
      needsYouSessions([approval, finished, input, archived, failed], {}).map(
        ({ id }) => id,
      ),
    ).toEqual(['approval', 'input', 'failed'])
  })

  it('leaves out one snoozed or acknowledged at this very update', () => {
    const dismissals: NeedsYouDismissals = {
      approval: { updatedAt: approval.updatedAt, disposition: 'snoozed' },
      failed: { updatedAt: failed.updatedAt, disposition: 'acknowledged' },
    }
    expect(
      needsYouSessions([approval, input, failed], dismissals).map(
        ({ id }) => id,
      ),
    ).toEqual(['input'])
  })

  it('counts it again once the conversation moves past the dismissal', () => {
    const dismissals: NeedsYouDismissals = {
      approval: {
        updatedAt: '2026-10-01T00:00:00.000Z',
        disposition: 'snoozed',
      },
    }
    expect(needsYouSessions([approval], dismissals)).toEqual([approval])
  })
})

describe('needsYouTone (R1)', () => {
  it('is warning while anything asks, danger for failed runs alone, nothing for none', () => {
    expect(
      needsYouTone([
        row('f', { attention: 'failed' }),
        row('a', { attention: 'needs-approval' }),
      ]),
    ).toBe('warning')
    expect(needsYouTone([row('f', { status: 'failed' })])).toBe('danger')
    expect(needsYouTone([row('d', { attention: 'finished' })])).toBeNull()
    expect(needsYouTone([])).toBeNull()
  })
})
