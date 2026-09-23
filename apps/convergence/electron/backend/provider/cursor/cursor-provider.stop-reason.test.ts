import { describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
  type MockCursorAcpServer,
} from './cursor-acp-server.fixture'
import {
  CURSOR_ACP_RECORDED_AGENT_MESSAGE_CHUNK,
  CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT,
  CURSOR_ACP_RECORDED_TOOL_CALL_PENDING,
} from './cursor-acp.recorded.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { CursorProvider } from './cursor-provider'

function waitFor(
  assertion: () => void,
  timeoutMs = 300,
  intervalMs = 10,
): Promise<void> {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(error)
          return
        }
        setTimeout(attempt, intervalMs)
      }
    }
    attempt()
  })
}

function startProvider(
  config?: Partial<Parameters<CursorProvider['start']>[0]>,
  options?: {
    debugSink?: ProviderDebugSink
    holdPrompt?: boolean
    holdInitialize?: boolean
  },
) {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {
    holdPrompt: options?.holdPrompt ?? true,
    holdInitialize: options?.holdInitialize,
  })
  const provider = new CursorProvider(
    'agent',
    options?.debugSink ?? noopDebugSink,
    undefined,
    { requestTimeoutMs: 1_000 },
  )
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
    ...config,
  })
  const deltas: SessionDelta[] = []
  const statuses: string[] = []
  const attentions: string[] = []
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange((status) => statuses.push(status))
  handle.onAttentionChange((attention) => attentions.push(attention))
  return {
    child,
    server,
    handle,
    deltas,
    statuses,
    attentions,
  }
}

function findNote(
  deltas: SessionDelta[],
  partial: { text?: string; level?: string },
): SessionDelta | undefined {
  return deltas.find((d) => {
    if (d.kind !== 'conversation.item.add') return false
    const item = d.item as { kind?: string; text?: string; level?: string }
    if (item.kind !== 'note') return false
    if (partial.text !== undefined && item.text !== partial.text) return false
    if (partial.level !== undefined && item.level !== partial.level)
      return false
    return true
  })
}

describe('Cursor provider stop reason', () => {
  it('end_turn settles completed/finished with no note (R2 done)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'end_turn' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })

    expect(statuses).not.toContain('failed')
    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeUndefined()
  })

  it('cancelled settles completed/finished with "stopped by user" info note (R2 cancelled)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'cancelled' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')
    expect(JSON.stringify(deltas)).toContain('stopped by user')
  })

  it('max_tokens settles completed/finished with a warning note (R2 cut-short)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'max_tokens' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe('Cursor ended this turn early: max_tokens.')
    }
  })

  it('max_turn_requests settles completed/finished with a warning note (R2 cut-short)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'max_turn_requests' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe('Cursor ended this turn early: max_turn_requests.')
    }
  })

  it('refusal settles completed/finished with a warning note (R2 refused)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'refusal' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe("Cursor's model refused this turn.")
    }
  })

  it('unknown stopReason settles completed/finished with a warning note naming the raw value (R2 unknown)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'gremlins' })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe(
        'Cursor ended this turn with an ending Convergence does not know: gremlins.',
      )
    }
  })

  it('missing stopReason settles completed/finished with "none" in the note (R2 unknown, silent case)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({})

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe(
        'Cursor ended this turn with an ending Convergence does not know: none.',
      )
    }
  })

  it('non-string stopReason settles completed/finished with the value in the note (R2 unknown)', async () => {
    const { server, statuses, attentions, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 42 })

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })

    expect(statuses).not.toContain('failed')
    expect(attentions).toContain('finished')

    const note = findNote(deltas, { level: 'warning' })
    expect(note).toBeDefined()
    if (note && note.kind === 'conversation.item.add') {
      const item = note.item as { text: string }
      expect(item.text).toBe(
        'Cursor ended this turn with an ending Convergence does not know: 42.',
      )
    }
  })

  // R3: the warning note is written inside endTurn, before setStatus.
  it('writes the warning note before the completed status (R3)', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    const beforeCount = deltas.length
    server.resolveHeldPrompt({ stopReason: 'max_tokens' })

    await waitFor(() => {
      const afterCount = deltas.length
      expect(afterCount).toBeGreaterThan(beforeCount)
    })

    const noteIdx = deltas.findIndex((d) => {
      if (d.kind !== 'conversation.item.add') return false
      const item = d.item as { kind?: string }
      return item.kind === 'note'
    })
    const completedIdx = deltas.findIndex(
      (d) =>
        d.kind === 'session.patch' &&
        (d as { patch: { status?: string } }).patch?.status === 'completed',
    )

    expect(noteIdx).toBeGreaterThan(-1)
    expect(completedIdx).toBeGreaterThan(-1)
    expect(noteIdx).toBeLessThan(completedIdx)
  })

  // Mutation: delete the cut-short branch and verify it falls through to unknown.
  // Since we cannot physically delete code at test time without a source transform,
  // this mutation is demonstrated by sending max_tokens and confirming it does NOT
  // fall to unknown (the cut-short branch IS active).
  it('max_tokens produces cut-short, not unknown (cut-short branch active)', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.resolveHeldPrompt({ stopReason: 'max_tokens' })

    await waitFor(() => {
      const note = findNote(deltas, { level: 'warning' })
      expect(note).toBeDefined()
      if (note && note.kind === 'conversation.item.add') {
        const item = note.item as { text: string }
        expect(item.text).toBe('Cursor ended this turn early: max_tokens.')
        expect(item.text).not.toContain('does not know')
      }
    })
  })

  // None of these should settle failed: no case below streams a dead turn's
  // line, and only that turns a stop reason class into failed (MAR-3302 R2).
  it('never settles failed for any stop reason class unless the turn is dead (R2)', async () => {
    const cases: Array<{ result: unknown }> = [
      { result: { stopReason: 'end_turn' } },
      { result: { stopReason: 'cancelled' } },
      { result: { stopReason: 'max_tokens' } },
      { result: { stopReason: 'refusal' } },
      { result: { stopReason: 'gremlins' } },
      { result: {} },
    ]

    for (const { result } of cases) {
      const { server, statuses } = startProvider()

      await waitFor(() => {
        expect(server.requests.map((r) => r.method)).toContain('session/prompt')
      })

      server.resolveHeldPrompt(result)

      await waitFor(() => {
        expect(statuses).toContain('completed')
      })

      expect(statuses).not.toContain('failed')
    }
  })
})

/** The dead turn of 2026-09-22 08:01:47Z (MAR-3298 lap 1), as it streamed. */
const DEAD_LINE =
  'Error: RetriableError: [canceled] http/2 stream closed with error code CANCEL (0x8)'

function sendUpdate(server: MockCursorAcpServer, update: unknown): void {
  server.send({
    jsonrpc: '2.0',
    method: 'session/update',
    params: { sessionId: 'cursor-session-1', update },
  })
}

function sendAssistantChunk(server: MockCursorAcpServer, text: string): void {
  sendUpdate(server, {
    ...CURSOR_ACP_RECORDED_AGENT_MESSAGE_CHUNK,
    content: { type: 'text', text },
  })
}

type FoldedItem = {
  id: string
  kind: string
  actor?: string
  text?: string
  level?: string
  providerMeta?: { providerEventType?: string | null }
}

/** The transcript as the record ends up holding it: adds, then patches by id. */
function foldItems(deltas: SessionDelta[]): FoldedItem[] {
  const items = new Map<string, FoldedItem>()
  for (const delta of deltas) {
    if (delta.kind === 'conversation.item.add') {
      const item = delta.item as unknown as FoldedItem
      items.set(item.id, { ...item })
    } else if (delta.kind === 'conversation.item.patch') {
      const current = items.get(delta.itemId)
      if (!current) continue
      const patch = delta.patch as Partial<FoldedItem>
      items.set(delta.itemId, {
        ...current,
        ...patch,
        providerMeta: { ...current.providerMeta, ...patch.providerMeta },
      })
    }
  }
  return [...items.values()]
}

function assistantTexts(items: FoldedItem[]): string[] {
  return items
    .filter((item) => item.kind === 'message' && item.actor === 'assistant')
    .map((item) => item.text ?? '')
}

function deadTurnNotes(items: FoldedItem[]): FoldedItem[] {
  return items.filter(
    (item) =>
      item.kind === 'note' &&
      item.providerMeta?.providerEventType === 'cursor-dead-turn',
  )
}

async function promptSent(server: MockCursorAcpServer): Promise<void> {
  await waitFor(() => {
    expect(server.requests.map((r) => r.method)).toContain('session/prompt')
  })
}

describe('Cursor provider: an error sentence is never a reply (MAR-3302 R2)', () => {
  it('a turn whose last segment is one `Error: ` line settles failed, the line a warning note', async () => {
    const { server, statuses, attentions, deltas } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, DEAD_LINE)
    await waitFor(() => {
      expect(assistantTexts(foldItems(deltas))).toContain(DEAD_LINE)
    })
    server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    await waitFor(() => {
      expect(statuses).toContain('failed')
      expect(attentions).toContain('failed')
    })
    // Mutation: keep `completed` for the dead turn -> red here.
    expect(statuses).not.toContain('completed')
    expect(attentions).not.toContain('finished')

    const items = foldItems(deltas)
    expect(assistantTexts(items)).not.toContain(DEAD_LINE)
    const notes = deadTurnNotes(items)
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({
      kind: 'note',
      level: 'warning',
      text: `Cursor's turn died: ${DEAD_LINE}`,
    })
    expect(notes[0].actor).toBeUndefined()
  })

  it('dies whatever the stop reason says', async () => {
    const { server, statuses } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, 'Error: T: WritableIterable is closed')
    await new Promise((resolve) => setTimeout(resolve, 20))
    server.resolveHeldPrompt({ stopReason: 'cancelled' })

    await waitFor(() => {
      expect(statuses).toContain('failed')
    })
    expect(statuses).not.toContain('completed')
  })

  it('a normal end_turn reply still settles completed', async () => {
    const { server, statuses, attentions, deltas } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, 'Done. BATON: fable')
    await new Promise((resolve) => setTimeout(resolve, 20))
    server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    await waitFor(() => {
      expect(statuses).toContain('completed')
      expect(attentions).toContain('finished')
    })
    expect(statuses).not.toContain('failed')
    const items = foldItems(deltas)
    expect(assistantTexts(items)).toEqual(['Done. BATON: fable'])
    expect(deadTurnNotes(items)).toHaveLength(0)
  })

  it('the line followed by a tool call and more text is a reply, not a death', async () => {
    const { server, statuses, deltas } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, DEAD_LINE)
    sendUpdate(server, CURSOR_ACP_RECORDED_TOOL_CALL_PENDING)
    sendAssistantChunk(server, 'Retried; all gates green.')
    await waitFor(() => {
      expect(assistantTexts(foldItems(deltas))).toContain(
        'Retried; all gates green.',
      )
    })
    server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    // Mutation: drop the "nothing after it" half (the tool_call branch no
    // longer flushes the segment) -> the line and the later text read as one
    // `Error: ` line -> red here.
    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(statuses).not.toContain('failed')
    const items = foldItems(deltas)
    expect(assistantTexts(items)).toEqual([
      DEAD_LINE,
      'Retried; all gates green.',
    ])
    expect(deadTurnNotes(items)).toHaveLength(0)
  })

  it('the line followed by a tool call and nothing else is not a death either', async () => {
    const { server, statuses, deltas } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, DEAD_LINE)
    sendUpdate(server, CURSOR_ACP_RECORDED_TOOL_CALL_PENDING)
    await waitFor(() => {
      expect(foldItems(deltas).some((item) => item.kind === 'tool-call')).toBe(
        true,
      )
    })
    server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(statuses).not.toContain('failed')
    expect(deadTurnNotes(foldItems(deltas))).toHaveLength(0)
  })

  it('a reply that opens with `Error:` and goes on is a reply', async () => {
    const { server, statuses, deltas } = startProvider()
    await promptSent(server)

    sendAssistantChunk(server, 'Error: the test was wrong.\n')
    sendAssistantChunk(server, 'I fixed it; gates are green.')
    await new Promise((resolve) => setTimeout(resolve, 20))
    server.resolveHeldPrompt(CURSOR_ACP_RECORDED_END_TURN_PROMPT_RESULT)

    await waitFor(() => {
      expect(statuses).toContain('completed')
    })
    expect(statuses).not.toContain('failed')
    expect(deadTurnNotes(foldItems(deltas))).toHaveLength(0)
  })
})
