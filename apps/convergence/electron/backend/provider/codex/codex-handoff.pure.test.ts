import { expect, it } from 'vitest'
import {
  isCodexThreadRuntimeIdle,
  readCodexLoadedThreadPage,
} from './codex-handoff.pure'

it('accepts only recognized loaded-list pages and cursors', () => {
  expect(readCodexLoadedThreadPage({ data: ['a'], nextCursor: 'b' })).toEqual({
    ids: ['a'],
    nextCursor: 'b',
  })
  expect(readCodexLoadedThreadPage({ data: [] })).toEqual({
    ids: [],
    nextCursor: null,
  })
  for (const value of [
    null,
    {},
    { data: [1] },
    { data: [''] },
    { data: [], nextCursor: 3 },
  ])
    expect(() => readCodexLoadedThreadPage(value)).toThrow()
})
it('treats active, error and unknown runtime states conservatively', () => {
  for (const type of ['idle', 'notLoaded'])
    expect(isCodexThreadRuntimeIdle({ thread: { status: { type } } })).toBe(
      true,
    )
  for (const type of ['active', 'systemError'])
    expect(isCodexThreadRuntimeIdle({ thread: { status: { type } } })).toBe(
      false,
    )
  expect(() =>
    isCodexThreadRuntimeIdle({ thread: { status: { type: 'unknown' } } }),
  ).toThrow()
})
