import { describe, expect, it, vi } from 'vitest'
import { Readable, Writable } from 'stream'
import {
  CursorAcpJsonRpcClient,
  CursorAcpJsonRpcError,
  type CursorAcpTransportDebugEntry,
} from './cursor-acp-jsonrpc'

function createMockStreams() {
  const written: string[] = []
  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      written.push(chunk.toString())
      callback()
    },
  })
  const stdout = new Readable({ read() {} })
  return { stdin, stdout, written }
}

describe('CursorAcpJsonRpcClient', () => {
  it('sends requests and resolves matching responses', async () => {
    const { stdin, stdout, written } = createMockStreams()
    const debug: CursorAcpTransportDebugEntry[] = []
    const client = new CursorAcpJsonRpcClient(stdin, stdout, {
      onDebug: (entry) => debug.push(entry),
    })

    const resultPromise = client.request('initialize', {
      email: 'person@example.com',
    })
    stdout.push('{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":1}}\n')

    await expect(resultPromise).resolves.toEqual({ protocolVersion: 1 })
    expect(JSON.parse(written[0] ?? '{}')).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
    })
    expect(debug[0]).toEqual({
      direction: 'out',
      channel: 'request',
      method: 'initialize',
      payload: { email: '[redacted]' },
    })
    expect(debug[1]).toEqual({
      direction: 'in',
      channel: 'response',
      method: 'initialize',
      payload: { protocolVersion: 1 },
      note: undefined,
    })
  })

  it('rejects responses with JSON-RPC errors', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new CursorAcpJsonRpcClient(stdin, stdout)

    const resultPromise = client.request('session/cancel', { sessionId: 's1' })
    stdout.push(
      '{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not found","data":{"method":"session/cancel"}}}\n',
    )

    await expect(resultPromise).rejects.toBeInstanceOf(CursorAcpJsonRpcError)
    await expect(resultPromise).rejects.toMatchObject({
      message: 'Method not found',
      code: -32601,
      data: { method: 'session/cancel' },
    })
  })

  it('routes notifications and server requests', async () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new CursorAcpJsonRpcClient(stdin, stdout)
    const notifications: Array<{ method: string; params: unknown }> = []

    client.onNotification((method, params) => {
      notifications.push({ method, params })
    })
    client.onServerRequest((_method, _params, id, rpc) => {
      rpc.respond(id, {
        outcome: {
          outcome: 'selected',
          optionId: 'reject-once',
        },
      })
    })

    stdout.push(
      '{"jsonrpc":"2.0","method":"session/update","params":{"sessionId":"s1"}}\n',
    )
    stdout.push(
      '{"jsonrpc":"2.0","id":99,"method":"session/request_permission","params":{"sessionId":"s1"}}\n',
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(notifications).toEqual([
      { method: 'session/update', params: { sessionId: 's1' } },
    ])
    expect(JSON.parse(written[0] ?? '{}')).toMatchObject({
      jsonrpc: '2.0',
      id: 99,
      result: {
        outcome: {
          outcome: 'selected',
          optionId: 'reject-once',
        },
      },
    })
  })

  it('responds with method-not-found when no server request handler is installed', async () => {
    const { stdin, stdout, written } = createMockStreams()
    new CursorAcpJsonRpcClient(stdin, stdout)

    stdout.push(
      '{"jsonrpc":"2.0","id":"req-1","method":"cursor/ask_question","params":{"question":"Continue?"}}\n',
    )
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(JSON.parse(written[0] ?? '{}')).toMatchObject({
      jsonrpc: '2.0',
      id: 'req-1',
      error: {
        code: -32601,
        message: 'Unsupported Cursor ACP server request: cursor/ask_question',
      },
    })
  })

  it('records malformed stdout without rejecting pending requests', async () => {
    const { stdin, stdout } = createMockStreams()
    const debug: CursorAcpTransportDebugEntry[] = []
    const client = new CursorAcpJsonRpcClient(stdin, stdout, {
      onDebug: (entry) => debug.push(entry),
    })

    const resultPromise = client.request('initialize')
    stdout.push('not json\n')
    stdout.push('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')

    await expect(resultPromise).resolves.toEqual({ ok: true })
    expect(debug).toContainEqual({
      direction: 'in',
      channel: 'stdout',
      bytes: 8,
      note: 'malformed-json-line',
      payload: { line: 'not json' },
    })
  })

  it('rejects pending requests on timeout and destroy', async () => {
    vi.useFakeTimers()
    const { stdin, stdout } = createMockStreams()
    const timeoutClient = new CursorAcpJsonRpcClient(stdin, stdout, {
      requestTimeoutMs: 25,
    })

    const timedOut = timeoutClient.request('initialize')
    const timeoutAssertion = expect(timedOut).rejects.toThrow(
      'Timed out waiting for Cursor ACP initialize after 25ms',
    )
    await vi.advanceTimersByTimeAsync(25)
    await timeoutAssertion
    vi.useRealTimers()

    const streams = createMockStreams()
    const destroyedClient = new CursorAcpJsonRpcClient(
      streams.stdin,
      streams.stdout,
    )
    const pending = destroyedClient.request('initialize')
    destroyedClient.destroy()
    await expect(pending).rejects.toThrow('Cursor ACP client destroyed')
  })

  it('allows disabling timeout for a long-running request', async () => {
    vi.useFakeTimers()
    try {
      const { stdin, stdout } = createMockStreams()
      const client = new CursorAcpJsonRpcClient(stdin, stdout, {
        requestTimeoutMs: 25,
      })

      const resultPromise = client.request(
        'session/prompt',
        { sessionId: 's1' },
        { timeoutMs: 0 },
      )

      await vi.advanceTimersByTimeAsync(250)
      stdout.push(
        '{"jsonrpc":"2.0","id":1,"result":{"stopReason":"end_turn"}}\n',
      )

      await expect(resultPromise).resolves.toEqual({ stopReason: 'end_turn' })
      client.destroy()
    } finally {
      vi.useRealTimers()
    }
  })
})
