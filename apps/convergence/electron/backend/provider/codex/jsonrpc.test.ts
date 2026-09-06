import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CODEX_RPC_BUDGETS_MS,
  JsonRpcClient,
  type JsonRpcTransport,
} from './jsonrpc'

/**
 * The client talks to a transport now, not to a pair of pipes (MAR-2823), so
 * the double is one too: `push` is the server speaking, `written` is what the
 * client wrote, and `fail`/`breakSend` are the two ways a connection dies.
 */
function createMockTransport(options: { sendThrows?: string } = {}) {
  const written: string[] = []
  let dataHandler: ((chunk: string) => void) | null = null
  let errorHandler: ((error: Error) => void) | null = null
  let closed = false

  const transport: JsonRpcTransport = {
    send(text) {
      if (options.sendThrows) throw new Error(options.sendThrows)
      written.push(text)
    },
    close() {
      closed = true
    },
    onData(handler) {
      dataHandler = handler
    },
    onError(handler) {
      errorHandler = handler
    },
  }

  return {
    transport,
    written,
    isClosed: () => closed,
    push: (line: string) => dataHandler?.(line),
    fail: (message: string) => errorHandler?.(new Error(message)),
  }
}

describe('JsonRpcClient', () => {
  it('sends a request and receives a response', async () => {
    const { transport, written, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const promise = client.request('initialize', { foo: 'bar' })

    // Simulate server response
    push('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')

    const result = await promise
    expect(result).toEqual({ ok: true })
    expect(written[0]).toContain('"method":"initialize"')
  })

  it('sends a notification', () => {
    const { transport, written } = createMockTransport()
    const client = new JsonRpcClient(transport)

    client.notify('initialized')

    expect(written[0]).toContain('"method":"initialized"')
    expect(written[0]).not.toContain('"id"')
  })

  it('handles server requests', async () => {
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const requests: Array<{ method: string; id: string | number }> = []
    client.onServerRequest((method, _params, id) => {
      requests.push({ method, id })
    })

    push(
      '{"jsonrpc":"2.0","id":100,"method":"item/commandExecution/requestApproval","params":{}}\n',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('item/commandExecution/requestApproval')
    expect(requests[0].id).toBe(100)
  })

  it('responds to server requests', () => {
    const { transport, written } = createMockTransport()
    const client = new JsonRpcClient(transport)

    client.respond(100, { decision: 'accept' })

    expect(written[0]).toContain('"id":100')
    expect(written[0]).toContain('"decision":"accept"')
  })

  it('handles notifications from server', async () => {
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const notifications: Array<{ method: string }> = []
    client.onNotification((method) => {
      notifications.push({ method })
    })

    push('{"jsonrpc":"2.0","method":"turn/complete","params":{}}\n')
    await new Promise((r) => setTimeout(r, 10))

    expect(notifications).toHaveLength(1)
    expect(notifications[0].method).toBe('turn/complete')
  })

  it('rejects pending requests on error response', async () => {
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const promise = client.request('bad-method')

    push('{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"Not found"}}\n')

    await expect(promise).rejects.toThrow('Not found')
  })

  it('rejects all pending on destroy', async () => {
    const { transport } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const promise = client.request('something')
    client.destroy()

    await expect(promise).rejects.toThrow('Client destroyed')
  })
})

describe('JsonRpcClient budgets (MAR-2316)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a request the server never answers, naming the method and the budget', async () => {
    vi.useFakeTimers()
    const { transport } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const promise = client.request('thread/resume')
    const settled = vi.fn()
    void promise.then(settled, settled)

    await vi.advanceTimersByTimeAsync(CODEX_RPC_BUDGETS_MS['thread/resume'] - 1)
    expect(settled).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2)

    await expect(promise).rejects.toThrow(
      /thread\/resume.*did not answer|did not answer.*thread\/resume/,
    )
  })

  it('keeps waiting while the server is still streaming', async () => {
    vi.useFakeTimers()
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    const promise = client.request('turn/start')
    const settled = vi.fn()
    void promise.then(settled, settled)

    const budget = CODEX_RPC_BUDGETS_MS['turn/start']

    // Traffic keeps arriving for well past the budget: the server is working,
    // not hung.
    for (let elapsed = 0; elapsed < budget * 3; elapsed += budget / 2) {
      await vi.advanceTimersByTimeAsync(budget / 2)
      push(
        '{"jsonrpc":"2.0","method":"item/agentMessage/delta","params":{"delta":"."}}\n',
      )
    }

    expect(settled).not.toHaveBeenCalled()

    push('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')
    await expect(promise).resolves.toEqual({ ok: true })
  })

  it('reports a transport failure instead of writing to a dead pipe', async () => {
    const failures: string[] = []
    const { transport } = createMockTransport({
      sendThrows: 'Codex app-server connection is closed',
    })
    const client = new JsonRpcClient(transport, {
      onTransportFailure: (error) => failures.push(error.message),
    })

    await expect(client.request('turn/start')).rejects.toThrow(/closed|write/i)
    expect(failures).toHaveLength(1)
  })

  it('surfaces a transport error rather than leaving it unhandled', async () => {
    const failures: string[] = []
    const { transport, fail } = createMockTransport()
    const client = new JsonRpcClient(transport, {
      onTransportFailure: (error) => failures.push(error.message),
    })

    const promise = client.request('skills/list')
    fail('write EPIPE')

    await expect(promise).rejects.toThrow('write EPIPE')
    expect(failures).toEqual(['write EPIPE'])
  })

  it('starts each request clock at its own send, not at the last inbound byte', async () => {
    // A connection-wide clock made a request *born expired*: idle longer than
    // the budget, and the first check measured silence that predated the send
    // (constitution A5).
    vi.useFakeTimers()
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport)

    await vi.advanceTimersByTimeAsync(CODEX_RPC_BUDGETS_MS['model/list'] * 2)

    const promise = client.request('model/list')
    const settled = vi.fn()
    void promise.then(settled, settled)

    await vi.advanceTimersByTimeAsync(10)
    push('{"jsonrpc":"2.0","id":1,"result":{"data":[]}}\n')

    await expect(promise).resolves.toEqual({ data: [] })
  })

  it('does not let another thread traffic keep a stuck request alive', async () => {
    // The resident server broadcasts other sessions' lifecycle events down
    // every connection; only this session's traffic is progress for it.
    vi.useFakeTimers()
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport, {
      isProgressNotification: (_method, params) =>
        (params as { threadId?: string })?.threadId === 'mine',
    })

    const promise = client.request('turn/start')
    const settled = vi.fn()
    void promise.then(settled, settled)

    const budget = CODEX_RPC_BUDGETS_MS['turn/start']
    for (let elapsed = 0; elapsed < budget; elapsed += budget / 4) {
      await vi.advanceTimersByTimeAsync(budget / 4)
      push(
        '{"jsonrpc":"2.0","method":"thread/started","params":{"threadId":"someone-else"}}\n',
      )
    }

    await vi.advanceTimersByTimeAsync(budget)
    await expect(promise).rejects.toThrow(/did not answer/)
  })

  it('does not let a threadless helper be kept alive by any traffic at all', async () => {
    // Quota, model list and skills hold no thread: their only progress is their
    // own response, so they say so and every broadcast on the socket is a
    // stranger's (MAR-2823 F6).
    vi.useFakeTimers()
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport, {
      budgets: { 'model/list': 40 },
      isProgressNotification: () => false,
    })

    const promise = client.request('model/list')
    const settled = vi.fn()
    void promise.then(settled, settled)

    for (let elapsed = 0; elapsed < 120; elapsed += 20) {
      await vi.advanceTimersByTimeAsync(20)
      push(
        '{"jsonrpc":"2.0","method":"thread/status/changed","params":{"threadId":"someone-else"}}\n',
      )
    }

    await expect(promise).rejects.toThrow(/did not answer/)
  })

  it('lets a response re-arm only the request it answers', async () => {
    // Any response used to reset every pending request's clock — including a
    // response to an id nobody is waiting for any more, which answers nothing
    // and still bought the stuck request another full budget (MAR-2823 F6).
    vi.useFakeTimers()
    const { transport, push } = createMockTransport()
    const client = new JsonRpcClient(transport, {
      budgets: { 'model/list': 40, 'skills/list': 4_000 },
    })

    const stuck = client.request('model/list')
    const settled = vi.fn()
    void stuck.then(settled, settled)
    void client.request('skills/list').catch(() => {})

    for (let elapsed = 0; elapsed < 120; elapsed += 20) {
      await vi.advanceTimersByTimeAsync(20)
      // A response to the other request, and one to nobody at all.
      push('{"jsonrpc":"2.0","id":2,"result":{"skills":[]}}\n')
      push('{"jsonrpc":"2.0","id":98,"result":{}}\n')
    }

    await expect(stuck).rejects.toThrow(/did not answer "model\/list"/)
  })

  it('closes the transport when the client is destroyed, and signals nothing else', () => {
    const { transport, isClosed } = createMockTransport()
    const client = new JsonRpcClient(transport)

    client.destroy()

    expect(isClosed()).toBe(true)
  })
})
