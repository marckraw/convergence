import { describe, expect, it } from 'vitest'
import type { TrackerOutsideIssue } from '@/shared/types/tracker.types'
import {
  LOOM_OUTSIDE_EMPTY_LINE,
  LOOM_OUTSIDE_MORE_LINE,
  LOOM_OUTSIDE_NEVER_READ_TITLE,
  loomOutsideOrder,
  loomOutsideTitle,
  loomOutsideView,
} from './loom-outside.pure'

const issue = (identifier: string, updatedAt: string): TrackerOutsideIssue => ({
  id: `id-${identifier}`,
  identifier,
  title: `Work ${identifier}`,
  url: `https://linear.app/example/issue/${identifier.toLowerCase()}`,
  status: 'Backlog',
  priority: null,
  labels: [],
  updatedAt,
})

describe('MAR-3236 R6: the group says what it read, honestly', () => {
  it('the title counts, and says `+` when the read was cut', () => {
    expect(loomOutsideTitle(12, false)).toBe('Not in the loop · 12')
    // Mutation: drop the `+` -> a cut list reads as the whole project, red.
    expect(loomOutsideTitle(300, true)).toBe('Not in the loop · 300+')
  })

  it('newest `updatedAt` first, ties by identifier', () => {
    const ordered = loomOutsideOrder([
      issue('EX-1', '2026-09-18T10:00:00.000Z'),
      issue('EX-3', '2026-09-19T10:00:00.000Z'),
      issue('EX-2', '2026-09-19T10:00:00.000Z'),
      issue('EX-4', '2026-09-17T10:00:00.000Z'),
    ])
    // Mutation: oldest first -> red.
    expect(ordered.map((each) => each.identifier)).toEqual([
      'EX-2',
      'EX-3',
      'EX-1',
      'EX-4',
    ])
  })

  it('never read: says so, and has nothing to open', () => {
    const view = loomOutsideView(null)
    expect(view).toEqual({
      title: LOOM_OUTSIDE_NEVER_READ_TITLE,
      foldable: false,
      rows: [],
      emptyLine: null,
      moreLine: null,
    })
    expect(LOOM_OUTSIDE_NEVER_READ_TITLE).toBe('Not in the loop · not read yet')
    // A snapshot the watcher answers before its first read is the same.
    expect(
      loomOutsideView({ crewId: 'c', issues: [], more: false, readAt: null })
        .title,
    ).toBe(LOOM_OUTSIDE_NEVER_READ_TITLE)
  })

  it('read and empty: zero, and the sentence that explains it', () => {
    const view = loomOutsideView({
      crewId: 'c',
      issues: [],
      more: false,
      readAt: '2026-09-19T12:00:00.000Z',
    })
    // Mutation: treat an empty read as never read -> red.
    expect(view.title).toBe('Not in the loop · 0')
    expect(view.emptyLine).toBe(LOOM_OUTSIDE_EMPTY_LINE)
    expect(LOOM_OUTSIDE_EMPTY_LINE).toBe(
      'Every open issue in this project carries a Loom label.',
    )
    expect(view.foldable).toBe(false)
  })

  it('cut short: the last line says there is more in Linear', () => {
    const view = loomOutsideView({
      crewId: 'c',
      issues: [issue('EX-1', '2026-09-19T10:00:00.000Z')],
      more: true,
      readAt: '2026-09-19T12:00:00.000Z',
    })
    expect(view.title).toBe('Not in the loop · 1+')
    expect(view.moreLine).toBe(LOOM_OUTSIDE_MORE_LINE)
    expect(LOOM_OUTSIDE_MORE_LINE).toBe(
      'More in Linear — showing the newest 300',
    )
    expect(view.emptyLine).toBeNull()
  })
})
