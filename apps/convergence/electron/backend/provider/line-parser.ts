import type { Readable } from 'stream'

export function parseJsonLines(
  stream: Readable,
  onLine: (data: unknown) => void,
  onError?: (error: Error) => void,
  onEnd?: () => void,
): void {
  let buffer = ''

  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString()
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed)
        onLine(parsed)
      } catch {
        // Skip non-JSON lines (stderr leaking, debug output, etc.)
      }
    }
  })

  stream.on('end', () => {
    // Process any remaining buffer
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim())
        onLine(parsed)
      } catch {
        // Skip
      }
    }
    onEnd?.()
  })

  stream.on('error', (err: Error) => {
    onError?.(err)
  })
}
