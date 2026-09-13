import { expect, it } from 'vitest'
import { answerWindowResult } from './answer-window.pure'
it('keeps the last main answer and last declaration independently — mutation inspect only final answer turns red', () => {
  expect(
    answerWindowResult([
      'early\nBATON: old',
      'next\nBATON: fable',
      'last answer',
    ]),
  ).toEqual({ message: 'last answer', baton: 'fable' })
  expect(answerWindowResult([])).toEqual({ message: null, baton: null })
})
