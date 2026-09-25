const { spawnMock, wire } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
  /** What the fake transport was asked, in order, across every process. */
  wire: {
    calls: [] as string[],
    closes: 0,
    status: [] as unknown[],
    reconnectFails: null as string | null,
  },
}))
vi.mock('child_process', () => ({ spawn: spawnMock }))
vi.mock('./claude-transport.service', async () => {
  const { createFixtureClaudeTransport } =
    await import('./claude-transport.fixture')
  return {
    createClaudeTransport: (
      input: Parameters<typeof createFixtureClaudeTransport>[0],
    ) => {
      const transport = createFixtureClaudeTransport(input)
      return {
        ...transport,
        mcpServerStatus: async () => {
          wire.calls.push('mcpServerStatus')
          return wire.status
        },
        reconnectMcpServer: async (name: string) => {
          wire.calls.push(`reconnectMcpServer:${name}`)
          if (wire.reconnectFails) throw new Error(wire.reconnectFails)
        },
        close: async () => {
          wire.closes++
          return transport.close()
        },
      }
    },
  }
})
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClaudeCodeProvider } from './claude-code-provider'
import type { SessionDelta } from '../../session/conversation-item.types'

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  kill = vi.fn(() => {
    this.emit('exit', 0)
    return true
  })
}

async function waitFor(assertion: () => void, timeoutMs = 1000) {
  const startedAt = Date.now()
  for (;;) {
    try {
      return assertion()
    } catch (error) {
      if (Date.now() - startedAt >= timeoutMs) throw error
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
  }
}

const figma = (status: string) => ({
  name: 'claude.ai Figma',
  status,
  scope: 'claudeai',
  config: {
    type: 'claudeai-proxy',
    url: 'https://mcp.figma.com/mcp',
    id: 'x',
  },
})

function mcpFacts(deltas: SessionDelta[]) {
  return deltas.flatMap((delta) =>
    delta.kind === 'harness.evidence' &&
    delta.evidence.kind === 'harness.mcpStatus'
      ? [delta.evidence]
      : [],
  )
}

function startResident(deltas: SessionDelta[]) {
  const child = new MockChildProcess()
  spawnMock.mockReturnValue(child)
  const handle = new ClaudeCodeProvider('/usr/local/bin/claude').start({
    sessionId: 'session-mcp-status',
    workingDirectory: process.cwd(),
    initialMessage: 'hello',
    initialAttachments: undefined,
    model: null,
    effort: null,
    continuationToken: null,
  })
  handle.onDelta((delta) => deltas.push(delta))
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})
  return { child, handle }
}

afterEach(() => {
  spawnMock.mockReset()
  wire.calls = []
  wire.closes = 0
  wire.status = []
  wire.reconnectFails = null
})

describe('MAR-3206 — the running session’s MCP status', () => {
  it('R1 reads the status after the start record and records scope and origin', async () => {
    const deltas: SessionDelta[] = []
    const { child, handle } = startResident(deltas)
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    wire.status = [figma('needs-auth')]
    child.stdout.write(
      `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's', plugins: [] })}\n`,
    )
    await waitFor(() => expect(mcpFacts(deltas)).toHaveLength(1))
    expect(mcpFacts(deltas)[0].servers).toEqual([
      {
        name: 'claude.ai Figma',
        status: 'needs-auth',
        scope: 'claudeai',
        origin: 'https://mcp.figma.com',
      },
    ])
    await handle.stop()
  })

  it('R3 Reconnect sends reconnectMcpServer to the running process, then reads the status; the row updates, nothing restarts — restart the session instead and this turns red', async () => {
    const deltas: SessionDelta[] = []
    const { child, handle } = startResident(deltas)
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    wire.status = [figma('needs-auth')]
    child.stdout.write(
      `${JSON.stringify({ type: 'system', subtype: 'init', session_id: 's', plugins: [] })}\n`,
    )
    await waitFor(() => expect(mcpFacts(deltas)).toHaveLength(1))
    expect(handle.canReconnectMcpServers).toBe(true)

    wire.calls = []
    wire.status = [figma('connected')]
    await handle.refreshMcpServers!('claude.ai Figma')

    expect(wire.calls).toEqual([
      'reconnectMcpServer:claude.ai Figma',
      'mcpServerStatus',
    ])
    expect(mcpFacts(deltas).at(-1)?.servers[0].status).toBe('connected')
    // The same process, never a second one, and never closed.
    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(wire.closes).toBe(0)
    await handle.stop()
  })

  it('R3 a refused reconnect still re-reads the status, then says why', async () => {
    const deltas: SessionDelta[] = []
    const { handle } = startResident(deltas)
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    wire.status = [figma('needs-auth')]
    wire.reconnectFails = 'needs authentication'
    await expect(handle.refreshMcpServers!('claude.ai Figma')).rejects.toThrow(
      'needs authentication',
    )
    expect(wire.calls).toEqual([
      'reconnectMcpServer:claude.ai Figma',
      'mcpServerStatus',
    ])
    await handle.stop()
  })

  it('R3 with no running process, Reconnect is refused and nothing is spawned', async () => {
    const deltas: SessionDelta[] = []
    const { handle } = startResident(deltas)
    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    await handle.stop()
    expect(handle.canReconnectMcpServers).toBe(false)
    await expect(handle.refreshMcpServers!('claude.ai Figma')).rejects.toThrow(
      'No Claude process is running for this conversation',
    )
    expect(wire.calls).toEqual([])
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })
})
