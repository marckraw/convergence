import { describe, expect, it } from 'vitest'
import { readIpcString } from './studio-ipc.pure'

describe('readIpcString', () => {
  it('passes a string through unchanged, empty one included', () => {
    expect(readIpcString('and make it blue')).toBe('and make it blue')
    expect(readIpcString('')).toBe('')
  })

  /**
   * Everything a window can put on a channel, and none of it is a sentence.
   *
   * Mutation: accept anything that is not null or undefined (`value == null ?
   * null : String(value)`) and the object, the number and the array all pass ->
   * red. The failure this closes is not cosmetic: `undefined` reaching
   * `conversationTitleFrom` throws inside the handler, and the rejection lands
   * in the renderer as an unhandled rejection with no sentence attached.
   */
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 7],
    ['an object', { text: 'hello' }],
    ['an array', ['hello']],
    ['a boolean', true],
  ])('refuses %s', (_label, value) => {
    expect(readIpcString(value)).toBeNull()
  })
})
