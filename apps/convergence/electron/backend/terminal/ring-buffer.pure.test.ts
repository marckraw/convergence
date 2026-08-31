import { describe, expect, it } from 'vitest'
import { createRingBuffer } from './ring-buffer.pure'

describe('createRingBuffer', () => {
  it('appends and snapshots single chunks', () => {
    const rb = createRingBuffer(1024)
    rb.append('hello')
    rb.append(' world')
    expect(rb.snapshot()).toBe('hello world')
  })

  it('returns empty snapshot for no appends', () => {
    expect(createRingBuffer().snapshot()).toBe('')
  })

  it('ignores empty chunks', () => {
    const rb = createRingBuffer(64)
    rb.append('')
    rb.append('a')
    rb.append('')
    expect(rb.snapshot()).toBe('a')
  })

  it('drops oldest chunks when byte budget exceeded', () => {
    const rb = createRingBuffer(6)
    rb.append('aaa')
    rb.append('bbb')
    rb.append('ccc')
    const snap = rb.snapshot()
    expect(Buffer.byteLength(snap, 'utf8')).toBeLessThanOrEqual(6)
    expect(snap.endsWith('ccc')).toBe(true)
  })

  it('trims a single oversized chunk while preserving utf8 boundaries', () => {
    const rb = createRingBuffer(6)
    rb.append('🍎🍎🍎') // each emoji = 4 bytes
    const snap = rb.snapshot()
    expect(Buffer.byteLength(snap, 'utf8')).toBeLessThanOrEqual(6)
    for (const ch of snap) {
      expect(ch.codePointAt(0)).toBeGreaterThanOrEqual(0x1f34e)
    }
  })

  it('keeps order across many small chunks', () => {
    const rb = createRingBuffer(10)
    for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']) {
      rb.append(s)
    }
    const snap = rb.snapshot()
    expect(snap.length).toBeLessThanOrEqual(10)
    expect(snap.endsWith('k')).toBe(true)
  })
})
