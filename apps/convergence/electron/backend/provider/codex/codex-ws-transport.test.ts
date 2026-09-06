import { createHash } from 'crypto'
import { createServer, type IncomingMessage, type Server } from 'http'
import type { Duplex } from 'stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectCodexWebSocket } from './codex-ws-transport'
import { JsonRpcClient } from './jsonrpc'

/**
 * A real RFC 6455 server, small enough to read.
 *
 * The assertions this file cares about are about the bytes on the wire — the
 * headers Node's global `WebSocket` puts in the upgrade, and the frames it
 * writes — so a mock socket would prove nothing. This is the only place in the
 * suite where the framing is real.
 */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

interface CapturedUpgrade {
  headers: IncomingMessage['headers']
}

function writeTextFrame(socket: Duplex, text: string): void {
  const payload = Buffer.from(text, 'utf8')
  const header: number[] = [0x81]
  if (payload.length < 126) {
    header.push(payload.length)
  } else if (payload.length < 65536) {
    header.push(126, (payload.length >> 8) & 0xff, payload.length & 0xff)
  } else {
    throw new Error('frame too large for this test server')
  }
  socket.write(Buffer.concat([Buffer.from(header), payload]))
}

function readTextFrames(buffer: Buffer): {
  frames: string[]
  rest: Buffer
  closed: boolean
} {
  const frames: string[] = []
  let closed = false
  let offset = 0

  for (;;) {
    if (buffer.length - offset < 2) break
    const opcode = buffer[offset] & 0x0f
    const masked = (buffer[offset + 1] & 0x80) !== 0
    let length = buffer[offset + 1] & 0x7f
    let cursor = offset + 2

    if (length === 126) {
      if (buffer.length - cursor < 2) break
      length = buffer.readUInt16BE(cursor)
      cursor += 2
    } else if (length === 127) {
      if (buffer.length - cursor < 8) break
      length = Number(buffer.readBigUInt64BE(cursor))
      cursor += 8
    }

    const maskKey = masked ? buffer.subarray(cursor, cursor + 4) : null
    if (masked) cursor += 4
    if (buffer.length - cursor < length) break

    const payload = Buffer.from(buffer.subarray(cursor, cursor + length))
    if (maskKey) {
      for (let i = 0; i < payload.length; i++) {
        payload[i] ^= maskKey[i % 4]
      }
    }
    cursor += length
    offset = cursor

    if (opcode === 0x8) {
      closed = true
      break
    }
    if (opcode === 0x1) frames.push(payload.toString('utf8'))
  }

  return { frames, rest: buffer.subarray(offset), closed }
}

function startWebSocketServer(options: {
  onFrame?: (text: string, reply: (text: string) => void) => void
  greeting?: string
  rejectUpgrade?: boolean
}): Promise<{
  url: string
  server: Server
  upgrades: CapturedUpgrade[]
  received: string[]
  closeSocket: () => void
}> {
  const upgrades: CapturedUpgrade[] = []
  const received: string[] = []
  let liveSocket: Duplex | null = null
  const server = createServer()

  server.on('upgrade', (request, socket) => {
    upgrades.push({ headers: request.headers })
    if (options.rejectUpgrade) {
      socket.end('HTTP/1.1 403 Forbidden\r\n\r\n')
      return
    }

    const accept = createHash('sha1')
      .update(String(request.headers['sec-websocket-key']) + WS_GUID)
      .digest('base64')
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n',
      ].join('\r\n'),
    )
    liveSocket = socket

    if (options.greeting) writeTextFrame(socket, options.greeting)

    let buffer: Buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      const { frames, rest, closed } = readTextFrames(buffer)
      buffer = rest
      for (const frame of frames) {
        received.push(frame)
        options.onFrame?.(frame, (text) => writeTextFrame(socket, text))
      }
      if (closed) socket.end()
    })
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        url: `ws://127.0.0.1:${port}`,
        server,
        upgrades,
        received,
        closeSocket: () => liveSocket?.destroy(),
      })
    })
  })
}

const servers: Server[] = []

afterEach(() => {
  for (const server of servers.splice(0, servers.length)) server.close()
})

describe('connectCodexWebSocket', () => {
  it('sends no Origin — the header the app-server answers 403 to', async () => {
    const harness = await startWebSocketServer({})
    servers.push(harness.server)

    const transport = await connectCodexWebSocket(harness.url)
    transport.close()

    expect(harness.upgrades).toHaveLength(1)
    expect(harness.upgrades[0].headers.origin).toBeUndefined()
  })

  it('offers permessage-deflate, which the app-server declines rather than refuses', async () => {
    // Node's global client offers compression and gives no way to withhold it.
    // Measured against codex-cli 0.153.4: the server answers 101 without
    // echoing the extension, so nothing is compressed and the offer is free.
    // This assertion exists so that a Node release which changes the offer, or
    // a server that starts echoing it, is read by a human (constitution A3).
    const harness = await startWebSocketServer({})
    servers.push(harness.server)

    const transport = await connectCodexWebSocket(harness.url)
    const headers = harness.upgrades[0].headers

    expect(headers['sec-websocket-extensions']).toBe(
      'permessage-deflate; client_max_window_bits',
    )
    expect(transport).toBeDefined()
    transport.close()
  })

  it('carries a request and its answer through a real JsonRpcClient', async () => {
    // Asserted through the client, not on the raw chunk: a WebSocket message
    // carries no trailing newline, so a transport that hands the bytes over
    // unchanged looks perfectly healthy at the socket and never resolves a
    // single request (this is how `initialize` hung against a live 0.153.4).
    const harness = await startWebSocketServer({
      onFrame: (text, reply) => {
        const message = JSON.parse(text.trim()) as { id: number }
        reply(JSON.stringify({ id: message.id, result: { ok: 'pong' } }))
      },
    })
    servers.push(harness.server)

    const transport = await connectCodexWebSocket(harness.url)
    const client = new JsonRpcClient(transport)

    await expect(client.request('ping')).resolves.toEqual({ ok: 'pong' })
    expect(harness.received[0]).toContain('"method":"ping"')
    client.destroy()
  })

  it('keeps a message that arrives before anyone is listening', async () => {
    const harness = await startWebSocketServer({
      greeting: JSON.stringify({
        jsonrpc: '2.0',
        method: 'thread/started',
        params: { thread: { id: 'someone-elses' } },
      }),
    })
    servers.push(harness.server)

    const transport = await connectCodexWebSocket(harness.url)
    await new Promise((resolve) => setTimeout(resolve, 50))

    const seen: string[] = []
    transport.onData((chunk) => seen.push(chunk))

    expect(seen.join('')).toContain('thread/started')
    transport.close()
  })

  it('reports a socket that dies under a live connection', async () => {
    const harness = await startWebSocketServer({})
    servers.push(harness.server)

    const transport = await connectCodexWebSocket(harness.url)
    const failures: Error[] = []
    transport.onError((error) => failures.push(error))
    harness.closeSocket()

    await vi.waitFor(() => expect(failures).toHaveLength(1))
    // `error` and `close` both fire on a dying socket; the owner hears one.
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(failures).toHaveLength(1)
    expect(() => transport.send('{}\n')).toThrow(/closed/i)
  })

  it('rejects when the upgrade is refused instead of resolving a dead transport', async () => {
    const harness = await startWebSocketServer({ rejectUpgrade: true })
    servers.push(harness.server)

    await expect(connectCodexWebSocket(harness.url)).rejects.toThrow()
  })
})
