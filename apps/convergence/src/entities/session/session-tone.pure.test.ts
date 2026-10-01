import { describe, expect, it } from 'vitest'
import { attentionTone } from './session-tone.pure'

describe('attentionTone (R1, MAR-3617)', () => {
  it.each([
    ['needs-approval', 'warning'],
    ['needs-input', 'warning'],
    ['finished', 'success'],
    ['failed', 'danger'],
    ['host-unreachable', 'warning'],
  ] as const)('%s is %s', (attention, tone) => {
    expect(attentionTone(attention)).toBe(tone)
  })

  it('waiting on you is never red', () => {
    expect(attentionTone('needs-approval')).not.toBe('danger')
    expect(attentionTone('needs-input')).not.toBe('danger')
    expect(attentionTone('host-unreachable')).not.toBe('danger')
  })

  it("has no tone for 'none', nor for anything the wire sent that it doesn't know", () => {
    expect(attentionTone('none')).toBeNull()
    expect(attentionTone('toString')).toBeNull()
    expect(attentionTone('constructor')).toBeNull()
    expect(attentionTone('something-new')).toBeNull()
  })
})
