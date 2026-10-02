import { describe, expect, it } from 'vitest'
import {
  ATTENTION_TONE,
  attentionTone,
  SESSION_STATE_TONE,
} from './session-tone.pure'

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

describe('SESSION_STATE_TONE, the one state map (NAV-1)', () => {
  it('says working is info, unreachable is warning and idle is neutral', () => {
    expect(SESSION_STATE_TONE.working).toBe('info')
    expect(SESSION_STATE_TONE.unreachable).toBe('warning')
    expect(SESSION_STATE_TONE.idle).toBe('neutral')
  })

  it('is what every attention reads (mutation: retune waiting -> both asks follow)', () => {
    expect(ATTENTION_TONE['needs-approval']).toBe(SESSION_STATE_TONE.waiting)
    expect(ATTENTION_TONE['needs-input']).toBe(SESSION_STATE_TONE.waiting)
    expect(ATTENTION_TONE['host-unreachable']).toBe(
      SESSION_STATE_TONE.unreachable,
    )
  })
})
