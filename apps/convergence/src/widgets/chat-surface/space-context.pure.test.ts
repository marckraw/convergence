import { describe, expect, it } from 'vitest'
import {
  applySpaceContextToMessage,
  buildSpaceContextBlock,
  withSpaceContextSource,
} from './space-context.pure'

const space = {
  id: 'space-1',
  title: 'Launch plan',
  status: 'exploring' as const,
  attention: 'none' as const,
  brief: 'Coordinate launch work.',
  memory: '',
  archivedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const source = {
  id: 'source-1',
  spaceId: space.id,
  filename: 'brief.md',
  originalPath: '/tmp/brief.md',
  storagePath: '/tmp/spaces/space-1/sources/source-1-brief.md',
  sizeBytes: 2048,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('space context preview', () => {
  it('builds only explicitly selected Space context', () => {
    const block = buildSpaceContextBlock({
      space,
      sources: [source],
      selection: {
        includeBrief: true,
        includeMemory: false,
        selectedSourceIds: [source.id],
      },
    })

    expect(block).toContain('Space brief')
    expect(block).toContain('Coordinate launch work.')
    expect(block).toContain('brief.md')
    expect(block).not.toContain('Prefer concise answers.')
  })

  it('returns null when no context is selected', () => {
    expect(
      buildSpaceContextBlock({
        space,
        sources: [source],
        selection: {
          includeBrief: false,
          includeMemory: false,
          selectedSourceIds: [],
        },
      }),
    ).toBeNull()
  })

  it('prepends selected Space context to the user request', () => {
    expect(applySpaceContextToMessage('Ship it', '<space_context />')).toBe(
      '<space_context />\n\nUser request:\nShip it',
    )
    expect(applySpaceContextToMessage('Ship it', null)).toBe('Ship it')
  })
})

describe('choosing a source (CONV-30)', () => {
  const selection = {
    includeBrief: true,
    includeMemory: false,
    selectedSourceIds: ['a'],
  }

  it('adds a chosen source once and drops a let-go one, keeping the rest — mutation keep a let-go source or add a chosen one twice turns red', () => {
    expect({
      added: withSpaceContextSource(selection, 'b', true),
      again: withSpaceContextSource(selection, 'a', true),
      dropped: withSpaceContextSource(selection, 'a', false),
    }).toEqual({
      added: { ...selection, selectedSourceIds: ['a', 'b'] },
      again: { ...selection, selectedSourceIds: ['a'] },
      dropped: { ...selection, selectedSourceIds: [] },
    })
  })
})
