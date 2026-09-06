import type { JsonRpcTransport } from './jsonrpc'

/**
 * The socket shape this transport needs, named so tests can hand it a double.
 *
 * Deliberately the standard `WebSocket` surface Node exposes globally rather
 * than a library's. Measured on 2026-09-05 (Node 24 / undici 7.28, codex-cli
 * 0.153.4), against the two traps the constitution names (A3):
 *
 * - **`Origin`**: never sent. This is the one that matters — the app-server
 *   answers `403` to any request carrying one, including `/readyz`.
 * - **`Sec-WebSocket-Extensions`**: Node's client offers
 *   `permessage-deflate; client_max_window_bits` and gives no way to withhold
 *   it (an explicit empty header is *prepended* to the offer, not replacing
 *   it). The app-server answers `101` **without echoing the extension** — it
 *   declines rather than refuses — so the connection runs uncompressed and the
 *   offer costs nothing. `codex-ws-transport.test.ts` pins both facts against a
 *   real handshake, so a change on either side is read by a human, not
 *   discovered by a dead session.
 */
export type CodexWebSocketFactory = (url: string) => WebSocket

export interface ConnectCodexWebSocketOptions {
  createWebSocket?: CodexWebSocketFactory
  /** How long the upgrade itself may take. Readiness is proven before this. */
  handshakeTimeoutMs?: number
}

export const CODEX_WS_HANDSHAKE_TIMEOUT_MS = 15_000

function describeCloseEvent(event: CloseEvent): string {
  const reason = event.reason?.trim()
  return `Codex app-server connection closed (${event.code}${reason ? `: ${reason}` : ''})`
}

/**
 * Opens one WebSocket to the resident app-server and dresses it as a
 * `JsonRpcTransport`.
 *
 * Inbound text is buffered until a handler is attached: the server broadcasts
 * `thread/started` to every connection the moment any session opens a thread
 * (constitution A2), so a message can land between the upgrade completing and
 * the `JsonRpcClient` being constructed around it. Dropping it there would be
 * a silent loss with no second copy.
 */
export function connectCodexWebSocket(
  url: string,
  options: ConnectCodexWebSocketOptions = {},
): Promise<JsonRpcTransport> {
  const createWebSocket =
    options.createWebSocket ?? ((target: string) => new WebSocket(target))
  const handshakeTimeoutMs =
    options.handshakeTimeoutMs ?? CODEX_WS_HANDSHAKE_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    let socket: WebSocket
    try {
      socket = createWebSocket(url)
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)))
      return
    }

    let opened = false
    let closed = false
    // A dying socket fires `error` AND `close`; the owner must hear one
    // failure, or a session shows the same obituary twice.
    let failureDelivered = false
    let dataHandler: ((chunk: string) => void) | null = null
    let errorHandler: ((error: Error) => void) | null = null
    const bufferedData: string[] = []
    let bufferedError: Error | null = null

    const timer = setTimeout(() => {
      if (opened) return
      try {
        socket.close()
      } catch {
        // The socket may already be past closing.
      }
      reject(
        new Error(
          `Codex app-server did not complete the WebSocket handshake within ${Math.round(
            handshakeTimeoutMs / 1000,
          )}s`,
        ),
      )
    }, handshakeTimeoutMs)
    timer.unref?.()

    const deliverData = (chunk: string) => {
      if (dataHandler) {
        dataHandler(chunk)
        return
      }
      bufferedData.push(chunk)
    }

    const deliverError = (error: Error) => {
      if (failureDelivered) return
      failureDelivered = true
      if (errorHandler) {
        errorHandler(error)
        return
      }
      // Only the first failure is kept: it is the one that explains the rest.
      bufferedError ??= error
    }

    socket.addEventListener('message', (event: MessageEvent) => {
      const data = event.data
      const text = typeof data === 'string' ? data : String(data)
      // A WebSocket message IS one complete document — the framing is the
      // socket's, so the app-server does not terminate its JSON with a
      // newline the way it must over a pipe. Restoring the delimiter here is
      // what lets one line reader serve both transports; without it every
      // response sat in the reader's buffer waiting for a newline that was
      // never coming, and `initialize` timed out against a healthy server
      // (measured against codex-cli 0.153.4, 2026-09-06).
      deliverData(text.endsWith('\n') ? text : `${text}\n`)
    })

    socket.addEventListener('error', () => {
      const error = new Error('Codex app-server connection failed')
      if (!opened) {
        clearTimeout(timer)
        reject(error)
        return
      }
      deliverError(error)
    })

    socket.addEventListener('close', (event: CloseEvent) => {
      closed = true
      const error = new Error(describeCloseEvent(event))
      if (!opened) {
        clearTimeout(timer)
        reject(error)
        return
      }
      deliverError(error)
    })

    socket.addEventListener('open', () => {
      opened = true
      clearTimeout(timer)
      resolve({
        send(text: string): void {
          if (closed || socket.readyState !== 1) {
            throw new Error('Codex app-server connection is closed')
          }
          socket.send(text)
        },
        close(): void {
          if (closed) return
          try {
            socket.close()
          } catch {
            // Closing an already-closing socket is not a failure.
          }
        },
        onData(handler: (chunk: string) => void): void {
          dataHandler = handler
          const buffered = bufferedData.splice(0, bufferedData.length)
          for (const chunk of buffered) handler(chunk)
        },
        onError(handler: (error: Error) => void): void {
          errorHandler = handler
          const pending = bufferedError
          bufferedError = null
          if (pending) handler(pending)
        },
      })
    })
  })
}
