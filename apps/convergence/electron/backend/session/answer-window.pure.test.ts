import { expect, it } from 'vitest'
import { answerWindowResult } from './answer-window.pure'
it('keeps the last main answer and last declaration independently — mutation inspect only final answer turns red', () => {
  expect(
    answerWindowResult([
      'early\nBATON: old',
      'next\nBATON: fable',
      'last answer',
    ]),
  ).toEqual({
    message: 'last answer',
    declaration: { kind: 'named', name: 'fable' },
  })
  expect(answerWindowResult([])).toEqual({
    message: null,
    declaration: { kind: 'none' },
  })
})
it.each([
  [['BATON: horse\nends in prose'], { kind: 'none' }],
  [['BATON: horse', 'attempt\nBATON:'], { kind: 'nameless' }],
])(
  'RUN77 lap4 reads last-line declarations %j — mutation scan all lines or lose empty declaration turns red',
  (messages, declaration) => {
    expect(answerWindowResult(messages).declaration).toEqual(declaration)
  },
)
