import { describe, expect, it } from 'vitest'
import { EXECUTION_HOST_REQUEST_CASES } from '../../../src/shared/lib/execution-host-id.fixture'
import { readExecutionHostIdAtDoor } from './execution-host-id-door.pure'

/**
 * The one ladder both per-machine doors climb (MAR-2689).
 *
 * Driven from the shared table rather than a copy of it, because a copy is the
 * defect this file exists to prevent: the rule for this id was written once at
 * the renderer door and once at the main-process one, and the two drifted three
 * times running. One table, one ladder, one place either can be widened.
 */
describe('readExecutionHostIdAtDoor', () => {
  it('reads every id the wire can deliver the way both doors must', () => {
    for (const testCase of EXECUTION_HOST_REQUEST_CASES) {
      const verdict = readExecutionHostIdAtDoor(testCase.id)
      if (testCase.thisMachine) {
        expect(verdict.kind, testCase.why).toBe('local')
        continue
      }
      expect(verdict.kind, testCase.why).not.toBe('local')
      if (verdict.kind === 'unusable') {
        expect(verdict.named, testCase.why).toBe(testCase.id)
      }
    }
  })

  it('takes a usable Endpoint id exactly as it was sent', () => {
    expect(readExecutionHostIdAtDoor('little-monster')).toEqual({
      kind: 'endpoint',
      endpointId: 'little-monster',
    })
  })

  it('refuses padded local rather than repairing it', () => {
    // ` local ` names no machine. Trimming here would reinstate at a new door
    // exactly what S2 killed at the old one.
    const verdict = readExecutionHostIdAtDoor(' local ')
    expect(verdict.kind).toBe('unusable')
  })

  it('refuses a value that is not a string, naming what arrived', () => {
    // `unknown` is what an IPC argument is, whatever the annotation claims.
    expect(readExecutionHostIdAtDoor(42)).toEqual({
      kind: 'unusable',
      named: 'a number (42)',
      reason: expect.stringContaining('an id is a string'),
    })
    expect(readExecutionHostIdAtDoor({ id: 'daemon-a' }).kind).toBe('unusable')
  })

  it('cannot be made to throw by the value it is describing', () => {
    // The sentence that exists to identify a bad value must not run the
    // caller's code to produce it.
    const hostile = {
      get toString() {
        throw new Error('nope')
      },
    }
    expect(() => readExecutionHostIdAtDoor(hostile)).not.toThrow()
    expect(() => readExecutionHostIdAtDoor(10n ** 40n)).not.toThrow()
  })
})
