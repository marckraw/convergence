import { describe, expect, it } from 'vitest'
import {
  ATTENTION_WORDS,
  inputRequestWords,
} from './session-attention-words.pure'

describe('the words of an attention (CONV-3)', () => {
  it('names every labelled attention in sentence case', () => {
    expect(ATTENTION_WORDS).toEqual({
      'needs-approval': 'Approval needed',
      'needs-input': 'Input needed',
      finished: 'Finished',
      failed: 'Failed',
      'host-unreachable': 'Host unreachable',
    })
    for (const words of Object.values(ATTENTION_WORDS)) {
      expect(words.slice(1)).toBe(words.slice(1).toLowerCase())
    }
  })

  it.each([
    ['question', 'Question needs answer'],
    ['plan', 'Plan review needed'],
    ['form', 'Form input needed'],
    ['url', 'URL confirmation needed'],
  ])('narrows an input request of kind %s to "%s"', (kind, words) => {
    expect(inputRequestWords(kind)).toBe(words)
  })

  it.each([null, undefined, 'input', 'choice', 'toString'])(
    'says "Input needed" for a kind with no words of its own (%s)',
    (kind) => {
      expect(inputRequestWords(kind)).toBe(ATTENTION_WORDS['needs-input'])
    },
  )
})
