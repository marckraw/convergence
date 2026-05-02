import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'stream'
import { JsonRpcClient } from './jsonrpc'

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

describe('JsonRpcClient', () => {
  it('sends a request and receives a response', async () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    const promise = client.request('initialize', { foo: 'bar' })

    // Simulate server response
    stdout.push('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n')

    const result = await promise
    expect(result).toEqual({ ok: true })
    expect(written[0]).toContain('"method":"initialize"')
  })

  it('sends a notification', () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    client.notify('initialized')

    expect(written[0]).toContain('"method":"initialized"')
    expect(written[0]).not.toContain('"id"')
  })

  it('handles server requests', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    const requests: Array<{ method: string; id: string | number }> = []
    client.onServerRequest((method, _params, id) => {
      requests.push({ method, id })
    })

    stdout.push(
      '{"jsonrpc":"2.0","id":100,"method":"item/commandExecution/requestApproval","params":{}}\n',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('item/commandExecution/requestApproval')
    expect(requests[0].id).toBe(100)
  })

  it('responds to server requests', () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    client.respond(100, { decision: 'accept' })

    expect(written[0]).toContain('"id":100')
    expect(written[0]).toContain('"decision":"accept"')
  })

  it('handles notifications from server', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    const notifications: Array<{ method: string }> = []
    client.onNotification((method) => {
      notifications.push({ method })
    })

    stdout.push('{"jsonrpc":"2.0","method":"turn/complete","params":{}}\n')
    await new Promise((r) => setTimeout(r, 10))

    expect(notifications).toHaveLength(1)
    expect(notifications[0].method).toBe('turn/complete')
  })

  it('rejects pending requests on error response', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    const promise = client.request('bad-method')

    stdout.push(
      '{"jsonrpc":"2.0","id":1,"error":{"code":-1,"message":"Not found"}}\n',
    )

    await expect(promise).rejects.toThrow('Not found')
  })

  it('rejects all pending on destroy', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new JsonRpcClient(stdin, stdout)

    const promise = client.request('something')
    client.destroy()

    await expect(promise).rejects.toThrow('Client destroyed')
  })
})
