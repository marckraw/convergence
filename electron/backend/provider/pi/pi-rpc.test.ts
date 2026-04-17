import { describe, expect, it } from 'vitest'
import { Readable, Writable } from 'stream'
import { PiRpcClient } from './pi-rpc'

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

describe('PiRpcClient', () => {
  it('sends a request and resolves on matching response id', async () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    const promise = client.request({ type: 'get_state' })

    stdout.push(
      '{"type":"response","command":"get_state","id":1,"success":true,"data":{"sessionFile":"/tmp/s.jsonl"}}\n',
    )

    const response = await promise
    expect(response.success).toBe(true)
    expect(response.command).toBe('get_state')
    expect((response.data as { sessionFile: string }).sessionFile).toBe(
      '/tmp/s.jsonl',
    )
    expect(written[0]).toContain('"type":"get_state"')
    expect(written[0]).toContain('"id":1')
  })

  it('delivers events (no id, no command) to the event handler', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    const events: string[] = []
    client.onEvent((event) => {
      events.push(event.type)
    })

    stdout.push('{"type":"agent_start"}\n')
    stdout.push('{"type":"turn_end","message":{}}\n')
    await new Promise((r) => setTimeout(r, 10))

    expect(events).toEqual(['agent_start', 'turn_end'])
  })

  it('routes extension_ui_request to the dedicated handler', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    const requests: Array<{ id: string; method: string }> = []
    client.onExtensionUiRequest((request) => {
      requests.push({ id: request.id, method: request.method })
    })

    stdout.push(
      '{"type":"extension_ui_request","id":"uuid-1","method":"confirm","title":"OK?"}\n',
    )
    await new Promise((r) => setTimeout(r, 10))

    expect(requests).toEqual([{ id: 'uuid-1', method: 'confirm' }])
  })

  it('sends extension UI responses without assigning a numeric id', () => {
    const { stdin, stdout, written } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    client.sendExtensionUiResponse('uuid-42', { cancelled: true })

    expect(written[0]).toContain('"type":"extension_ui_response"')
    expect(written[0]).toContain('"id":"uuid-42"')
    expect(written[0]).toContain('"cancelled":true')
  })

  it('rejects pending requests on destroy', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    const promise = client.request({ type: 'get_state' })
    client.destroy()

    await expect(promise).rejects.toThrow('Client destroyed')
  })

  it('does not route unrelated responses to event handler', async () => {
    const { stdin, stdout } = createMockStreams()
    const client = new PiRpcClient(stdin, stdout)

    const events: string[] = []
    client.onEvent((event) => {
      events.push(event.type)
    })

    // Response for an unknown id — should not emit as event
    stdout.push(
      '{"type":"response","command":"set_model","id":999,"success":true}\n',
    )
    // Real event should still pass through
    stdout.push('{"type":"agent_start"}\n')
    await new Promise((r) => setTimeout(r, 10))

    expect(events).toEqual(['agent_start'])
  })
})
