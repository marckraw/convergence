import { describe, expect, it } from 'vitest'
import { EXECUTION_HOST_REQUEST_CASES } from './execution-host-id.fixture'
import {
  LOCAL_EXECUTION_HOST_ID,
  namesThisMachine,
} from './execution-host-id.pure'

describe('namesThisMachine', () => {
  it('accepts exactly four values and reads every other id as a machine', () => {
    // The same table both doors are driven through, so the predicate and the
    // doors cannot come to disagree about a row (MAR-2682).
    for (const { id, thisMachine, why } of EXECUTION_HOST_REQUEST_CASES) {
      expect(namesThisMachine(id), why).toBe(thisMachine)
    }
    expect(namesThisMachine(LOCAL_EXECUTION_HOST_ID)).toBe(true)
  })

  it('reads a value that is not a string as a machine, never as absence', () => {
    // A wire delivers what it delivers; the annotation upstream is a claim.
    // Reading a non-string as absence is how a request that meant a daemon was
    // answered with a laptop's provider list (MAR-2682).
    for (const value of [
      0,
      1n,
      false,
      {},
      [],
      Symbol('local'),
      () => 'local',
      new String('local'),
    ]) {
      expect(namesThisMachine(value)).toBe(false)
    }
  })
})
