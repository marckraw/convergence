import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { CursorProvider } from './cursor-provider'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'
import {
  CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
  CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST,
} from './cursor-acp.recorded.fixture'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))
vi.mock('child_process', async (original) => ({
  ...(await original<typeof import('child_process')>()),
  spawn: spawnMock,
}))

function waitFor(
  assertion: () => void,
  timeoutMs = 3000,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) reject(error)
        else setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

function startProvider(
  options: {
    holdPrompt?: boolean
  } = {},
) {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {
    holdPrompt: options.holdPrompt,
  })
  const provider = new CursorProvider('agent')
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange((status) => statuses.push(status))
  return { child, server, handle, deltas, statuses }
}

function notesFromDeltas(
  deltas: SessionDelta[],
): Array<{ kind: 'note'; text: string; level: string }> {
  return deltas
    .filter(
      (
        delta,
      ): delta is Extract<SessionDelta, { kind: 'conversation.item.add' }> =>
        delta.kind === 'conversation.item.add',
    )
    .map((delta) => delta.item)
    .filter(
      (item): item is Extract<typeof item, { kind: 'note' }> =>
        (item as { kind?: string }).kind === 'note',
    ) as Array<{ kind: 'note'; text: string; level: string }>
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('Cursor provider todo list (MAR-3241)', () => {
  it('1. full then merge (both as REQUESTS): the second note has every item and only the merged ones are marked', async () => {
    const { server, deltas } = startProvider({ holdPrompt: true })

    await waitFor(() => {
      expect(server.requests.some((r) => r.method === 'session/prompt')).toBe(
        true,
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'cursor/update_todos',
      params: CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
    })

    server.send({
      jsonrpc: '2.0',
      id: 2,
      method: 'cursor/update_todos',
      params: CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST,
    })

    await waitFor(() => {
      const notes = notesFromDeltas(deltas)
      expect(notes.length).toBeGreaterThanOrEqual(2)

      const secondNote = notes[1]
      expect(secondNote.text).toContain('Review README and mark todos done')

      expect(
        secondNote.text.includes(
          'Inspect repo purpose/structure for README content \u2190 updated',
        ),
      ).toBe(true)
      expect(
        secondNote.text.includes('Draft README.md via subagent \u2190 updated'),
      ).toBe(true)
      expect(secondNote.text).not.toContain(
        'Review README and mark todos done \u2190 updated',
      )
    })

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
  })

  it('2. the same merge as NOTIFICATION (no id) produces the same whole-list note', async () => {
    const { server, deltas } = startProvider({ holdPrompt: true })

    await waitFor(() => {
      expect(server.requests.some((r) => r.method === 'session/prompt')).toBe(
        true,
      )
    })

    server.send({
      jsonrpc: '2.0',
      id: 1,
      method: 'cursor/update_todos',
      params: CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST,
    })

    await waitFor(() => {
      expect(notesFromDeltas(deltas).length).toBeGreaterThanOrEqual(1)
    })

    server.send({
      jsonrpc: '2.0',
      method: 'cursor/update_todos',
      params: CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST,
    })

    await waitFor(() => {
      const notes = notesFromDeltas(deltas)
      expect(notes.length).toBeGreaterThanOrEqual(2)

      const secondNote = notes[1]
      expect(secondNote.text).toContain('Review README and mark todos done')
      expect(
        secondNote.text.includes(
          'Inspect repo purpose/structure for README content \u2190 updated',
        ),
      ).toBe(true)
      expect(
        secondNote.text.includes('Draft README.md via subagent \u2190 updated'),
      ).toBe(true)
    })

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
  })
})
