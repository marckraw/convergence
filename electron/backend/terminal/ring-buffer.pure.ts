import type { RingBuffer } from './terminal.types'

export const DEFAULT_RING_BUFFER_BYTES = 512 * 1024

export function createRingBuffer(
  maxBytes = DEFAULT_RING_BUFFER_BYTES,
): RingBuffer {
  const chunks: string[] = []
  let totalBytes = 0

  return {
    append(chunk: string): void {
      if (!chunk) return
      chunks.push(chunk)
      totalBytes += Buffer.byteLength(chunk, 'utf8')

      while (totalBytes > maxBytes && chunks.length > 1) {
        const dropped = chunks.shift()!
        totalBytes -= Buffer.byteLength(dropped, 'utf8')
      }

      if (totalBytes > maxBytes && chunks.length === 1) {
        const only = chunks[0]
        const onlyBytes = Buffer.byteLength(only, 'utf8')
        if (onlyBytes > maxBytes) {
          const trimmed = trimUtf8Tail(only, maxBytes)
          chunks[0] = trimmed
          totalBytes = Buffer.byteLength(trimmed, 'utf8')
        }
      }
    },
    snapshot(): string {
      return chunks.join('')
    },
  }
}

function trimUtf8Tail(value: string, maxBytes: number): string {
  const buf = Buffer.from(value, 'utf8')
  if (buf.byteLength <= maxBytes) return value
  const slice = buf.subarray(buf.byteLength - maxBytes)
  let start = 0
  while (
    start < slice.byteLength &&
    (slice[start]! & 0b11000000) === 0b10000000
  ) {
    start++
  }
  return slice.subarray(start).toString('utf8')
}
