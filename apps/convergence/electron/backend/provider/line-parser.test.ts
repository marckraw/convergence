import { describe, expect, it } from 'vitest'
import { Readable } from 'stream'
import { parseJsonLines } from './line-parser'

function createReadable(chunks: string[]): Readable {
  const stream = new Readable({ read() {} })
  for (const chunk of chunks) {
    stream.push(chunk)
  }
  stream.push(null)
  return stream
}

describe('parseJsonLines', () => {
  it('parses complete JSON lines', async () => {
    const lines: unknown[] = []
    const stream = createReadable(['{"type":"a"}\n{"type":"b"}\n'])

    await new Promise<void>((resolve) => {
      parseJsonLines(stream, (data) => lines.push(data), undefined, resolve)
    })

    expect(lines).toEqual([{ type: 'a' }, { type: 'b' }])
  })

  it('handles split chunks', async () => {
    const lines: unknown[] = []
    const stream = createReadable(['{"ty', 'pe":"split"}\n'])

    await new Promise<void>((resolve) => {
      parseJsonLines(stream, (data) => lines.push(data), undefined, resolve)
    })

    expect(lines).toEqual([{ type: 'split' }])
  })

  it('skips non-JSON lines', async () => {
    const lines: unknown[] = []
    const stream = createReadable([
      'not json\n{"type":"valid"}\nmore garbage\n',
    ])

    await new Promise<void>((resolve) => {
      parseJsonLines(stream, (data) => lines.push(data), undefined, resolve)
    })

    expect(lines).toEqual([{ type: 'valid' }])
  })

  it('handles empty lines', async () => {
    const lines: unknown[] = []
    const stream = createReadable(['\n\n{"type":"ok"}\n\n'])

    await new Promise<void>((resolve) => {
      parseJsonLines(stream, (data) => lines.push(data), undefined, resolve)
    })

    expect(lines).toEqual([{ type: 'ok' }])
  })

  it('parses trailing data without newline', async () => {
    const lines: unknown[] = []
    const stream = createReadable(['{"type":"trailing"}'])

    await new Promise<void>((resolve) => {
      parseJsonLines(stream, (data) => lines.push(data), undefined, resolve)
    })

    expect(lines).toEqual([{ type: 'trailing' }])
  })
})
