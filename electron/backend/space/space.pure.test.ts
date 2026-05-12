import { describe, expect, it } from 'vitest'
import { normalizeOptionalText, normalizeRequiredText } from './space.pure'
import {
  spaceAttemptFromRow,
  spaceFromRow,
  spaceArtifactFromRow,
} from './space.types'

describe('space pure helpers', () => {
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

  it('maps space rows and falls back unknown enum values', () => {
    expect(
      spaceFromRow({
        id: 'i1',
        title: 'Space',
        status: 'unknown',
        attention: 'weird',
        brief: 'context',
        memory: 'memory',
        archived_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      status: 'exploring',
      attention: 'none',
      brief: 'context',
    })
  })

  it('maps attempt and artifact rows', () => {
    expect(
      spaceAttemptFromRow({
        id: 'a1',
        space_id: 'i1',
        session_id: 's1',
        role: 'seed',
        is_primary: 1,
        created_at: '2026-01-01T00:00:00.000Z',
      }),
    ).toMatchObject({
      spaceId: 'i1',
      sessionId: 's1',
      role: 'seed',
      isPrimary: true,
    })

    expect(
      spaceArtifactFromRow({
        id: 'o1',
        space_id: 'i1',
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
