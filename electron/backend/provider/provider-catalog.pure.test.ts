import { describe, expect, it } from 'vitest'
import { describeNonStringExecutionHostId } from './provider-catalog.pure'

/**
 * The formatter's own table (MAR-2682).
 *
 * `ProviderCatalogService.get` promises an unreachable catalog for every bad
 * execution host id, including the ones a caller built to be hostile. That
 * promise is only as strong as this function, so this is where the hostile
 * values are driven: what it says about a value, and what it refuses to ask the
 * value itself.
 */
describe('describeNonStringExecutionHostId', () => {
  it('names a value by its type, and reads nothing off it', () => {
    // Only the primitives whose text the runtime produces from the value are
    // rendered at all. An object is its type and nothing more -- no
    // `toString`, no `valueOf`, no constructor name, no own keys.
    expect(describeNonStringExecutionHostId(7)).toBe('a number (7)')
    expect(describeNonStringExecutionHostId(true)).toBe('a boolean (true)')
    expect(describeNonStringExecutionHostId(1n)).toBe('a bigint (1)')
    expect(describeNonStringExecutionHostId({})).toBe('an object')
    expect(describeNonStringExecutionHostId(['daemon-a'])).toBe('an object')
    expect(describeNonStringExecutionHostId(null)).toBe('an object')
    expect(describeNonStringExecutionHostId(undefined)).toBe('an undefined')
    expect(describeNonStringExecutionHostId(Symbol('daemon'))).toBe('a symbol')
    expect(describeNonStringExecutionHostId(() => 'daemon-a')).toBe(
      'a function',
    )
  })

  it('never lets the value take part in describing itself', () => {
    // The three values that made the old `JSON.stringify` throw, plus the two
    // shapes that run caller code through the accessors a friendlier formatter
    // would reach for. The sentence that exists to identify a bad id must not
    // be produced by the id.
    //
    // Mutation: describe the value with `JSON.stringify` again, and the first
    // three rows throw instead of answering; render objects with `String(value)`
    // and the last two rows carry text the caller wrote.
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const hostileToJson = {
      toJSON() {
        throw new Error('the value decides what its own refusal says')
      },
    }
    const hostileToString = {
      toString() {
        throw new Error('never called')
      },
      valueOf() {
        throw new Error('never called either')
      },
    }
    const trapped = new Proxy(
      {},
      {
        get() {
          throw new Error('no property of this value is ever read')
        },
        ownKeys() {
          throw new Error('nor are its keys')
        },
      },
    )

    for (const value of [
      1n,
      circular,
      hostileToJson,
      hostileToString,
      trapped,
    ]) {
      expect(() => describeNonStringExecutionHostId(value)).not.toThrow()
    }
    expect(describeNonStringExecutionHostId(circular)).toBe('an object')
    expect(describeNonStringExecutionHostId(hostileToJson)).toBe('an object')
    expect(describeNonStringExecutionHostId(hostileToString)).toBe('an object')
    expect(describeNonStringExecutionHostId(trapped)).toBe('an object')
  })

  it('bounds the one type whose own text has no bound', () => {
    // A bigint renders from itself and can be arbitrarily long; everything else
    // rendered here is short by construction. The ellipsis is the tell that a
    // reader is looking at a truncation rather than the whole id.
    //
    // Mutation: drop the length bound, and the 81-digit id comes back whole.
    const long = describeNonStringExecutionHostId(10n ** 80n)
    expect(long.startsWith('a bigint (')).toBe(true)
    expect(long).toContain('…')
    expect(long.length).toBeLessThan(60)

    // And a value that fits is not truncated.
    expect(describeNonStringExecutionHostId(12345n)).toBe('a bigint (12345)')
  })
})
