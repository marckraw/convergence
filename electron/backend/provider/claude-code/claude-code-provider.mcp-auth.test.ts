import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { spawnMock } = vi.hoisted(() => ({ spawnMock: vi.fn() }))

vi.mock('child_process', () => ({
  spawn: spawnMock,
}))

import { ClaudeCodeProvider } from './claude-code-provider'
import type { ClaudeAccountLookup } from './claude-code-provider'
import type { SessionDelta } from '../../session/conversation-item.types'

const ACCOUNT_A = {
  configDir: '/home/.convergence/provider-accounts/claude/acct-a',
  credentialDir: '/home/.convergence/provider-credentials/claude/acct-a',
}

const lookup: ClaudeAccountLookup = (id) => (id === 'acct-a' ? ACCOUNT_A : null)

class MockChildProcess extends EventEmitter {
  stdin = new PassThrough()
  stdout = new PassThrough()
  stderr = new PassThrough()
  private exited = false

  kill = vi.fn(() => {
    this.emitExit(0)
    return true
  })

  emitExit(code: number): void {
    if (this.exited) return
    this.exited = true
    this.emit('exit', code)
  }
}

function waitFor(assertion: () => void, timeoutMs = 1000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
        assertion()
        resolve()
      } catch (error) {
        if (Date.now() - startedAt >= timeoutMs) return reject(error)
        setTimeout(attempt, 10)
      }
    }
    attempt()
  })
}

function notes(deltas: SessionDelta[]) {
  return deltas.flatMap((delta) =>
    delta.kind === 'conversation.item.add' && delta.item.kind === 'note'
      ? [delta.item]
      : [],
  )
}

function toolResultEvent(text: string): string {
  return `${JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: text }],
    },
  })}\n`
}

function startSession(options: {
  child: MockChildProcess
  deltas: SessionDelta[]
  providerAccountId?: string | null
  canOpenBrowser?: boolean
}) {
  spawnMock.mockReturnValue(options.child)

  const provider = new ClaudeCodeProvider(
    '/usr/local/bin/claude',
    null,
    undefined,
    null,
    lookup,
    (id) => (id === 'acct-a' ? 'work@example.com' : null),
    options.canOpenBrowser ?? true,
  )
  const handle = provider.start({
    sessionId: 'session-mcp-auth',
    workingDirectory: process.cwd(),
    initialMessage: 'use linear',
    initialAttachments: undefined,
    model: null,
    effort: null,
    continuationToken: null,
    providerAccountId: options.providerAccountId ?? null,
  })

  handle.onDelta((delta) => options.deltas.push(delta))
  handle.onStatusChange(() => {})
  handle.onAttentionChange(() => {})
  handle.onContinuationToken(() => {})
  handle.onContextWindowChange(() => {})
  handle.onActivityChange(() => {})

  return handle
}

afterEach(() => {
  spawnMock.mockReset()
  vi.restoreAllMocks()
})

describe('dirty MCP reconnection', () => {
  /**
   * The failure this exists to prevent is a *silent* one: an unauthorized
   * connector fails inside a tool result, reads as an ordinary tool error, and
   * the turn carries on with that capability quietly missing.
   */
  it('turns an auth-shaped tool failure into an actionable note', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession({ child, deltas, providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent('MCP server "linear" requires authentication'),
    )

    await waitFor(() => expect(notes(deltas)).toHaveLength(1))
    const note = notes(deltas)[0]
    if (note.kind !== 'note') throw new Error('expected a note')

    expect(note.level).toBe('warning')
    expect(note.text).toContain('linear')
    // Names the account too: the connector may be authorized under another one.
    expect(note.text).toContain('work@example.com')
    expect(note.action).toEqual({
      kind: 'authorize-mcp-server',
      serverName: 'linear',
      providerAccountId: 'acct-a',
    })
  })

  it('attributes the note to the ambient default when no account was selected', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession({ child, deltas })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent('MCP server "linear" requires authentication'),
    )

    await waitFor(() => expect(notes(deltas)).toHaveLength(1))
    const note = notes(deltas)[0]
    if (note.kind !== 'note') throw new Error('expected a note')

    expect(note.text).toContain('the default account')
    expect(note.action?.providerAccountId).toBeNull()
  })

  it('says a browser cannot be opened rather than offering a dead action', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession({
      child,
      deltas,
      providerAccountId: 'acct-a',
      canOpenBrowser: false,
    })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent('MCP server "linear" requires authentication'),
    )

    await waitFor(() => expect(notes(deltas)).toHaveLength(1))
    const note = notes(deltas)[0]
    if (note.kind !== 'note') throw new Error('expected a note')

    expect(note.text).toMatch(/cannot open a browser/)
  })

  it('says it once per server, not once per failed call', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession({ child, deltas, providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(
      toolResultEvent('MCP server "linear" requires authentication'),
    )
    await waitFor(() => expect(notes(deltas)).toHaveLength(1))
    child.stdout.write(
      toolResultEvent('MCP server "linear" requires authentication'),
    )
    child.stdout.write(
      toolResultEvent('MCP server "github" requires authentication'),
    )

    await waitFor(() => expect(notes(deltas)).toHaveLength(2))
    expect(
      notes(deltas).map((note) =>
        note.kind === 'note' ? note.action?.serverName : null,
      ),
    ).toEqual(['linear', 'github'])
  })

  it('stays quiet for an ordinary tool failure', async () => {
    const child = new MockChildProcess()
    const deltas: SessionDelta[] = []
    startSession({ child, deltas, providerAccountId: 'acct-a' })

    await waitFor(() => expect(spawnMock).toHaveBeenCalledTimes(1))
    child.stdout.write(toolResultEvent('MCP server linear returned 3 issues'))
    child.stdout.write(toolResultEvent('Error: file not found'))

    // Settle, then assert the absence.
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(notes(deltas)).toHaveLength(0)
  })
})
