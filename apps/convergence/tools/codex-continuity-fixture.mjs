import assert from 'node:assert/strict'
import { createServer } from 'node:http'

/** Loopback Responses fixture: synthetic text only, never proxies a request. */
export async function startContinuityFixture({ onRequest } = {}) {
  const requests = []
  const connections = []
  const errors = []
  const server = createServer(async (request, response) => {
    try {
      assert.equal(request.method, 'POST')
      assert.match(request.url, /^\/(account-a|account-b)\/v1\/responses$/)
      assert.equal(request.headers.authorization, undefined)
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      assert(Array.isArray(body.input), 'Expected an outbound input array')
      assert.equal(body.model, 'cvg-continuity-fixture')
      const home = request.url.split('/')[1]
      const index = requests.length + 1
      const reply = `SYNTHETIC_REPLY_${home}_${index}`
      const capture = {
        home,
        index,
        reply,
        input: body.input,
        previousResponseId: body.previous_response_id ?? null,
      }
      requests.push(capture)
      await onRequest?.(capture)
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      })
      if (JSON.stringify(body.input).includes('SYNTHETIC_MALFORMED_CONTROL')) {
        capture.malformed = true
        response.end('event: response.completed\ndata: {not-json}\n\n')
        return
      }
      const id = `resp_fixture_${index}`
      const item = {
        type: 'message',
        id: `msg_fixture_${index}`,
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text: reply, annotations: [] }],
      }
      const event = (value) =>
        response.write(
          `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`,
        )
      event({
        type: 'response.created',
        response: { id, object: 'response', status: 'in_progress', output: [] },
      })
      event({
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...item, status: 'in_progress', content: [] },
      })
      event({
        type: 'response.content_part.added',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: { type: 'output_text', text: '', annotations: [] },
      })
      event({
        type: 'response.output_text.delta',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        delta: reply,
      })
      event({
        type: 'response.output_text.done',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        text: reply,
      })
      event({
        type: 'response.content_part.done',
        item_id: item.id,
        output_index: 0,
        content_index: 0,
        part: item.content[0],
      })
      event({ type: 'response.output_item.done', output_index: 0, item })
      event({
        type: 'response.completed',
        response: {
          id,
          object: 'response',
          status: 'completed',
          output: [item],
          usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 0 },
          },
        },
      })
      response.end()
    } catch (error) {
      errors.push(error.message)
      response.writeHead(400)
      response.end('Invalid fixture request')
    }
  })
  server.on('connection', (socket) =>
    connections.push({
      address: socket.remoteAddress,
      port: socket.remotePort,
    }),
  )
  server.on('upgrade', (_request, socket) => {
    errors.push('Unexpected WebSocket upgrade to the HTTP fixture')
    socket.destroy()
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  return {
    requests,
    connections,
    errors,
    baseUrl: (home) => `http://127.0.0.1:${address.port}/${home}/v1`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve)
        server.closeAllConnections()
      }),
  }
}
