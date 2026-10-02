import { describe, expect, it } from 'vitest'
import {
  DIFF_CONTEXT_NOT_HERE,
  diffContextReasons,
} from './diff-context-reasons.pure'

const all = {
  canExpandBefore: true,
  canExpandAfter: true,
  expandedFromDefault: true,
  canExpandBeforeHere: true,
  canExpandAfterHere: true,
  canExpandBothHere: true,
  canResetHere: true,
}

describe('diffContextReasons (R2: unavailable says why)', () => {
  it('gives no reason while every control can act', () => {
    expect(diffContextReasons(all)).toEqual({
      above: undefined,
      both: undefined,
      below: undefined,
      reset: undefined,
    })
  })

  it('says the file starts or ends here, and that the whole file shows', () => {
    const reasons = diffContextReasons({
      ...all,
      canExpandBefore: false,
      canExpandAfter: false,
      expandedFromDefault: false,
    })
    expect(reasons.above).toBe('The file starts here: nothing above to show.')
    expect(reasons.below).toBe('The file ends here: nothing below to show.')
    expect(reasons.both).toBe('The whole file is showing.')
    expect(reasons.reset).toBe('This is the usual context already.')
  })

  it('keeps both available while either side can still grow', () => {
    expect(
      diffContextReasons({ ...all, canExpandBefore: false }).both,
    ).toBeUndefined()
  })

  it('says the view itself cannot, when it was given no action', () => {
    const reasons = diffContextReasons({
      ...all,
      canExpandBeforeHere: false,
      canExpandAfterHere: false,
      canExpandBothHere: false,
      canResetHere: false,
    })
    expect(Object.values(reasons)).toEqual([
      DIFF_CONTEXT_NOT_HERE,
      DIFF_CONTEXT_NOT_HERE,
      DIFF_CONTEXT_NOT_HERE,
      DIFF_CONTEXT_NOT_HERE,
    ])
  })
})
