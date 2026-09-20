import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import { CursorProvider } from './cursor-provider'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
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

function promptsOf(server: MockCursorAcpServer) {
  return server.requests.filter(
    (request) => request.method === 'session/prompt',
  )
}

const completions = (statuses: string[]) =>
  statuses.filter((status) => status === 'completed').length

function sendTodos(
  server: MockCursorAcpServer,
  id: number,
  params: unknown,
): void {
  server.send({
    jsonrpc: '2.0',
    id,
    method: 'cursor/update_todos',
    params,
  })
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

/**
 * Only the todo notes: a `/clear` writes its own boundary note, and this
 * file's subject is the todo list, not the transcript around it.
 */
function todoNotes(deltas: SessionDelta[]) {
  return notesFromDeltas(deltas).filter((note) =>
    note.text.startsWith('Cursor todos'),
  )
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
  /**
   * R3: the list lives with the session and dies with it. The todo request is
   * sent inside an ACCEPTED turn (held prompt), because a todo update is a
   * fact of a turn — an idle gap has no turn to record into.
   * Mutation: delete `liveTodos = []` from `clearLiveSessionState()` → red.
   */
  it('3. a /clear empties the list: the next merge note lists only that request todos', async () => {
    const { server, handle, deltas, statuses } = startProvider({
      holdPrompt: true,
    })

    await waitFor(() => expect(promptsOf(server)).toHaveLength(1))

    sendTodos(server, 1, CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST)
    await waitFor(() => {
      expect(todoNotes(deltas)).toHaveLength(1)
      expect(todoNotes(deltas)[0].text).toContain(
        'Review README and mark todos done',
      )
    })

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => expect(completions(statuses)).toBe(1))

    handle.sendMessage('/clear')
    await waitFor(() => expect(completions(statuses)).toBe(2))

    handle.sendMessage('carry on')
    await waitFor(() => expect(promptsOf(server)).toHaveLength(2))

    sendTodos(server, 2, CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST)
    await waitFor(() => expect(todoNotes(deltas)).toHaveLength(2))

    const afterClear = todoNotes(deltas)[1]
    expect(afterClear.text).toContain(
      '[completed] Inspect repo purpose/structure for README content',
    )
    expect(afterClear.text).toContain(
      '[in_progress] Draft README.md via subagent',
    )
    // Item 3 was named only by the FULL request of the session the /clear ended.
    expect(afterClear.text).not.toContain('Review README and mark todos done')

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => expect(completions(statuses)).toBe(3))
  })

  it('3b. a respawn after the child exits empties it too', async () => {
    const firstChild = new MockCursorAcpChild()
    const firstServer = createMockCursorAcp(firstChild, { holdPrompt: true })
    const secondChild = new MockCursorAcpChild()
    const secondServer = createMockCursorAcp(secondChild, {
      holdPrompt: true,
      firstSessionOrdinal: 101,
    })
    const children = [firstChild, secondChild]
    spawnMock.mockImplementation(
      () =>
        children[spawnMock.mock.calls.length - 1] ?? new MockCursorAcpChild(),
    )

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

    await waitFor(() => expect(promptsOf(firstServer)).toHaveLength(1))

    sendTodos(firstServer, 1, CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST)
    await waitFor(() => {
      expect(todoNotes(deltas)).toHaveLength(1)
      expect(todoNotes(deltas)[0].text).toContain(
        'Review README and mark todos done',
      )
    })

    firstServer.resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => expect(completions(statuses)).toBe(1))

    firstChild.emit('exit', 0, null)

    handle.sendMessage('carry on')
    await waitFor(() => expect(promptsOf(secondServer)).toHaveLength(1))

    sendTodos(secondServer, 2, CURSOR_ACP_RECORDED_UPDATE_TODOS_MERGE_REQUEST)
    await waitFor(() => expect(todoNotes(deltas)).toHaveLength(2))

    const afterRespawn = todoNotes(deltas)[1]
    expect(afterRespawn.text).toContain(
      '[completed] Inspect repo purpose/structure for README content',
    )
    expect(afterRespawn.text).not.toContain('Review README and mark todos done')

    secondServer.resolveHeldPrompt({ stopReason: 'end_turn' })
    await waitFor(() => expect(completions(statuses)).toBe(2))
  })
  /**
   * R4: the acknowledgement Cursor is waiting for is answered BEFORE the note
   * is recorded, so a local write can never decide whether the far side is
   * answered (MAR-3143 lap 2, A).
   *
   * The witness is the order of two artifacts — the bytes written to the CLI
   * and the recorded note — because a REFUSED note cannot witness this seam at
   * all: inside an accepted turn `emitDelta` catches the `RecordingError` and
   * `announce()` is itself all-catching by MAR-3023 R5, so the write never
   * throws back and both orders answer Cursor. See `cursor-provider.accepted-
   * recording.test.ts` for the refused-note half, through a real database.
   *
   * Mutation: swap the two statements in the `cursor/update_todos` request
   * branch so the note is recorded before `respond` → red.
   */
  it('4. the acknowledgement is on the wire before the note is recorded', async () => {
    const { child, server, deltas, handle } = startProvider({
      holdPrompt: true,
    })

    await waitFor(() => expect(promptsOf(server)).toHaveLength(1))

    const timeline: string[] = []
    let acknowledgement: unknown
    handle.onDelta((delta) => {
      const [note] = notesFromDeltas([delta])
      if (note?.text.startsWith('Cursor todos')) timeline.push('note')
    })
    const realWrite = child.stdin.write.bind(child.stdin)
    vi.spyOn(child.stdin, 'write').mockImplementation(((
      chunk: string,
      ...rest: unknown[]
    ) => {
      if (String(chunk).includes('"id":91')) {
        acknowledgement = JSON.parse(String(chunk))
        timeline.push('acknowledgement')
      }
      return (realWrite as (...args: unknown[]) => boolean)(chunk, ...rest)
    }) as never)

    sendTodos(server, 91, CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST)

    await waitFor(() => expect(todoNotes(deltas)).toHaveLength(1))

    expect(timeline).toEqual(['acknowledgement', 'note'])
    // Byte-for-byte today's acknowledgement, read off the wire rather than
    // rebuilt from the builder the production path uses.
    expect(acknowledgement).toEqual({
      jsonrpc: '2.0',
      id: 91,
      result: {
        outcome: {
          outcome: 'accepted',
          todos: CURSOR_ACP_RECORDED_UPDATE_TODOS_FULL_REQUEST.todos,
        },
      },
    })

    server.resolveHeldPrompt({ stopReason: 'end_turn' })
  })
})
