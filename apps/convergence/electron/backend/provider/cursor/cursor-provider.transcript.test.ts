import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'
import { CursorProvider } from './cursor-provider'
import {
  CURSOR_ACP_RECORDED_TOOL_CALL_DIFF_UPDATE,
  CURSOR_ACP_RECORDED_USER_MESSAGE_CHUNK,
} from './cursor-acp.recorded.fixture'

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

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

function startProvider(debugSink: ProviderDebugSink = noopDebugSink) {
  const child = new MockCursorAcpChild()
  spawnMock.mockReturnValue(child)
  const server = createMockCursorAcp(child, {})
  const provider = new CursorProvider('agent', debugSink)
  const handle = provider.start({
    sessionId: 'session-1',
    workingDirectory: '/repo',
    initialMessage: 'hi',
    model: null,
    effort: null,
    continuationToken: null,
  })
  const deltas: SessionDelta[] = []
  handle.onDelta((delta) => deltas.push(delta))
  return { child, server, handle, deltas }
}

afterEach(() => {
  spawnMock.mockReset()
})

describe('Cursor provider transcript', () => {
  it('emits a tool result containing the diff path, not just Status (R1)', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'call-recorded-example',
          title: 'Edit File',
          kind: 'edit',
          status: 'pending',
          rawInput: {},
        },
      },
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: CURSOR_ACP_RECORDED_TOOL_CALL_DIFF_UPDATE,
      },
    })

    await waitFor(() => {
      const toolResult = deltas.find(
        (d) =>
          d.kind === 'conversation.item.add' && d.item.kind === 'tool-result',
      )
      expect(toolResult).toBeDefined()
      if (toolResult && toolResult.kind === 'conversation.item.add') {
        const item = toolResult.item as unknown as { outputText: string }
        expect(item.outputText).toContain('/tmp/probe-repo/note.txt')
        expect(item.outputText).toContain('ping')
        expect(item.outputText).not.toContain('Status: completed')
      }
    })
  })

  it('emits zero transcript deltas for user_message_chunk updates (R2)', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    const beforeCount = deltas.length

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: CURSOR_ACP_RECORDED_USER_MESSAGE_CHUNK,
      },
    })

    // Drain microtasks to let any delta fire.
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(deltas.length).toBe(beforeCount)
  })

  it('records an unknown sessionUpdate kind to the debug sink exactly once (R3)', async () => {
    const debugRecords: Array<Parameters<ProviderDebugSink['record']>[0]> = []
    const debugSink = {
      record: vi.fn((entry) => debugRecords.push(entry)),
    }
    const { server } = startProvider(debugSink)

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'brand_new_kind',
          data: 'first',
        },
      },
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'brand_new_kind',
          data: 'second',
        },
      },
    })

    await waitFor(() => {
      const unknownEntries = debugRecords.filter(
        (e) =>
          e.direction === 'in' &&
          e.channel === 'notification' &&
          e.method === 'sessionUpdate:brand_new_kind',
      )
      expect(unknownEntries).toHaveLength(1)
      expect(unknownEntries[0].note).toContain('brand_new_kind')
    })
  })

  it('renders a plan update as [status] content thinking lines, not JSON (R4)', async () => {
    const { server, deltas } = startProvider()

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.send({
      jsonrpc: '2.0',
      method: 'session/update',
      params: {
        sessionId: 'cursor-session-1',
        update: {
          sessionUpdate: 'plan',
          entries: [
            { content: 'Inspect layout', status: 'completed' },
            { content: 'Refactor component', status: 'in_progress' },
            { content: 'Write tests', status: 'pending' },
          ],
        },
      },
    })

    await waitFor(() => {
      const thinkingDelta = deltas.find(
        (d) => d.kind === 'conversation.item.add' && d.item.kind === 'thinking',
      )
      expect(thinkingDelta).toBeDefined()
      if (thinkingDelta && thinkingDelta.kind === 'conversation.item.add') {
        const item = thinkingDelta.item as unknown as { text: string }
        const text = item.text
        expect(text).toContain('[completed] Inspect layout')
        expect(text).toContain('[in_progress] Refactor component')
        expect(text).toContain('[pending] Write tests')
        // Must NOT be a raw JSON dump.
        expect(text).not.toContain('{')
      }
    })
  })
})
