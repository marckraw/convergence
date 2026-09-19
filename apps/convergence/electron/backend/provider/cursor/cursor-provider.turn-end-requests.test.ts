import { describe, expect, it, vi } from 'vitest'
import type { SessionDelta } from '../../session/conversation-item.types'
import {
  noopDebugSink,
  type ProviderDebugSink,
} from '../../provider-debug/provider-debug-sink'
import {
  createMockCursorAcp,
  MockCursorAcpChild,
} from './cursor-acp-server.fixture'

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
    holdPrompt: options?.holdPrompt,
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

describe('Cursor turn-end requests (R1)', () => {
  it('answers an open permission request "cancelled" when the turn ends', async () => {
    // No permissionConfig — the default (ask) mode, where permissions are
    // NOT auto-approved and register in pendingApprovals (grounding #3).
    const { server } = startProvider(undefined, { holdPrompt: true })

    await waitFor(() => {
      expect(server.requests.map((r) => r.method)).toContain('session/prompt')
    })

    server.send({
      jsonrpc: '2.0',
      id: 88,
      method: 'session/request_permission',
      params: {
        sessionId: 'cursor-session-1',
        toolCall: {
          toolCallId: 'tool-1',
          title: 'Run tests',
          kind: 'execute',
          rawInput: { command: 'npm test' },
        },
        options: [
          { optionId: 'allow-once', name: 'Allow once' },
          { optionId: 'reject-once', name: 'Reject' },
        ],
      },
    })

    await waitFor(() => {
      expect(
        server.responses.some(
          (r) =>
            r.id === 88 &&
            JSON.stringify(r.result).includes('needs-approval') === false,
        ),
      )
      // Actually, the approval hasn't been answered yet.
    })

    // End the turn by resolving the held prompt.
    server.resolveHeldPrompt({ stopReason: 'end_turn' })

    // After the turn ends, the open permission must have been answered "cancelled".
    await waitFor(() => {
      expect(server.responses).toContainEqual(
        expect.objectContaining({
          id: 88,
          result: { outcome: { outcome: 'cancelled' } },
        }),
      )
    })
  })

  it('arms the silence timeout again after a turn that ended with an open request (R1 / Test 2)', async () => {
    vi.useFakeTimers()
    try {
      const { CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS } =
        await import('./cursor-acp-contract.pure')
      const { server, handle } = startProvider(undefined, {
        holdPrompt: true,
      })

      await vi.waitFor(() => {
        expect(server.requests.map((r) => r.method)).toContain('session/prompt')
      })

      // Send a permission request whose id is left open when the turn ends.
      server.send({
        jsonrpc: '2.0',
        id: 88,
        method: 'session/request_permission',
        params: {
          sessionId: 'cursor-session-1',
          toolCall: {
            toolCallId: 'tool-1',
            title: 'Run tests',
            kind: 'execute',
            rawInput: { command: 'npm test' },
          },
          options: [
            { optionId: 'allow-once', name: 'Allow once' },
            { optionId: 'reject-once', name: 'Reject' },
          ],
        },
      })

      await vi.waitFor(() => {
        expect(server.responses.some((r) => r.id === 88)).toBe(false)
      })

      // End the turn. The permission is answered "cancelled" and closed.
      server.resolveHeldPrompt({ stopReason: 'end_turn' })

      await vi.waitFor(() => {
        expect(server.responses).toContainEqual(
          expect.objectContaining({
            id: 88,
            result: { outcome: { outcome: 'cancelled' } },
          }),
        )
      })

      // Second turn — holdPrompt is per-server so the next prompt is also held.
      handle.sendMessage('second turn')

      await vi.waitFor(() => {
        expect(
          server.requests.filter((r) => r.method === 'session/prompt'),
        ).toHaveLength(2)
      })

      // Advance past the silence budget — the timeout should arm and fire.
      await vi.advanceTimersByTimeAsync(CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS)

      await vi.waitFor(() => {
        expect(
          server.notifications.some((n) => n.method === 'session/cancel'),
        ).toBe(true)
      })
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })

  it('arms the silence timeout after a turn that failed with a JSON-RPC error (R1 / Test 3)', async () => {
    vi.useFakeTimers()
    try {
      const { CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS } =
        await import('./cursor-acp-contract.pure')
      const { server, handle } = startProvider(undefined, {
        holdPrompt: true,
      })

      await vi.waitFor(() => {
        expect(server.requests.map((r) => r.method)).toContain('session/prompt')
      })

      // Send a permission request.
      server.send({
        jsonrpc: '2.0',
        id: 88,
        method: 'session/request_permission',
        params: {
          sessionId: 'cursor-session-1',
          toolCall: {
            toolCallId: 'tool-1',
            title: 'Run tests',
            kind: 'execute',
            rawInput: { command: 'npm test' },
          },
          options: [
            { optionId: 'allow-once', name: 'Allow once' },
            { optionId: 'reject-once', name: 'Reject' },
          ],
        },
      })

      await vi.waitFor(() => {
        expect(server.responses.some((r) => r.id === 88)).toBe(false)
      })

      // Reject the held prompt with a JSON-RPC error (the handlePromptFailure
      // site). The prompt request's id is the fourth request the client sends
      // (initialize=1, authenticate=2, session/new=3, session/prompt=4).
      server.send({
        jsonrpc: '2.0',
        id: 4,
        error: { code: -32603, message: 'Internal error' },
      })

      // Wait for the failure to propagate and the open request to be answered
      // "cancelled" by endTurn inside handlePromptFailure.
      await vi.waitFor(
        () => {
          expect(
            server.responses.some(
              (r) =>
                r.id === 88 && JSON.stringify(r.result).includes('cancelled'),
            ),
          ).toBe(true)
        },
        { timeout: 5000 },
      )

      // Second turn.
      handle.sendMessage('second turn')

      await vi.waitFor(() => {
        expect(
          server.requests.filter((r) => r.method === 'session/prompt'),
        ).toHaveLength(2)
      })

      // Advance past the silence budget — the timeout should arm and fire.
      await vi.advanceTimersByTimeAsync(CURSOR_ACP_PROMPT_SILENCE_BUDGET_MS)

      await vi.waitFor(() => {
        expect(
          server.notifications.some((n) => n.method === 'session/cancel'),
        ).toBe(true)
      })
      handle.dispose?.()
    } finally {
      vi.useRealTimers()
    }
  })
})
