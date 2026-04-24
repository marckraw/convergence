import { describe, expect, it } from 'vitest'
import { normalizeOptionalText, normalizeRequiredText } from './initiative.pure'
import {
  initiativeAttemptFromRow,
  initiativeFromRow,
  initiativeOutputFromRow,
} from './initiative.types'

describe('initiative pure helpers', () => {
  it('normalizes required text', () => {
    expect(normalizeRequiredText('  Build Workboard  ', 'Title')).toBe(
      'Build Workboard',
    )
  })

  it('throws for empty required text', () => {
    expect(() => normalizeRequiredText('   ', 'Title')).toThrow(
      'Title is required',
    )
  })

  it('normalizes optional text', () => {
    expect(normalizeOptionalText('  notes  ')).toBe('notes')
    expect(normalizeOptionalText(undefined)).toBe('')
  })

  it('maps initiative rows and falls back unknown enum values', () => {
    expect(
      initiativeFromRow({
        id: 'i1',
        title: 'Initiative',
        status: 'unknown',
        attention: 'weird',
        current_understanding: 'context',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      status: 'exploring',
      attention: 'none',
      currentUnderstanding: 'context',
    })
  })

  it('maps attempt and output rows', () => {
    expect(
      initiativeAttemptFromRow({
        id: 'a1',
        initiative_id: 'i1',
        session_id: 's1',
        role: 'seed',
        is_primary: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      initiativeId: 'i1',
      sessionId: 's1',
      role: 'seed',
      isPrimary: true,
    })

    expect(
      initiativeOutputFromRow({
        id: 'o1',
        initiative_id: 'i1',
        kind: 'pull-request',
        label: 'PR',
        value: 'https://example.com/pr/1',
        source_session_id: 's1',
        status: 'merged',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      kind: 'pull-request',
      sourceSessionId: 's1',
      status: 'merged',
    })
  })
})
