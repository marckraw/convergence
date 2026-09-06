import type { Readable } from 'stream'

/**
 * Reads newline-delimited JSON out of a stream of text chunks.
 *
 * Split out from `parseJsonLines` so the same framing serves a transport that
 * is not a stream: the Codex app-server speaks the identical newline-JSON
 * protocol over a WebSocket, where messages arrive as strings rather than as
 * `data` events on a `Readable` (MAR-2823).
 */
export function createJsonLineReader(onLine: (data: unknown) => void): {
  push: (chunk: string) => void
  flush: () => void
} {
  let buffer = ''

  const emit = (candidate: string) => {
    const trimmed = candidate.trim()
    if (!trimmed) return

    try {
      onLine(JSON.parse(trimmed))
    } catch {
      // Skip non-JSON lines (stderr leaking, debug output, etc.)
    }
  }

  return {
    push(chunk: string): void {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) emit(line)
    },
    flush(): void {
      const remaining = buffer
      buffer = ''
      emit(remaining)
    },
  }
}

export function parseJsonLines(
  stream: Readable,
  onLine: (data: unknown) => void,
  onError?: (error: Error) => void,
  onEnd?: () => void,
): void {
  const reader = createJsonLineReader(onLine)

  stream.on('data', (chunk: Buffer | string) => {
    reader.push(chunk.toString())
  })

  stream.on('end', () => {
    reader.flush()
    onEnd?.()
  })

  stream.on('error', (err: Error) => {
    onError?.(err)
  })
}
