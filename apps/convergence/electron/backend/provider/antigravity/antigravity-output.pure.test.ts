import { describe, expect, it } from 'vitest'
import { extractAntigravityPrintDelta } from './antigravity-output.pure'

describe('antigravity-output', () => {
  it('removes a previous assistant answer from resumed print output', () => {
    expect(
      extractAntigravityPrintDelta({
        stdout: 'FIRST\nSECOND\n',
        previousAssistantTexts: ['FIRST'],
      }),
    ).toBe('SECOND')
  })

  it('removes the longest known transcript prefix', () => {
    expect(
      extractAntigravityPrintDelta({
        stdout: 'One\n\nTwo\n\nThree',
        previousAssistantTexts: ['One', 'Two'],
      }),
    ).toBe('Three')
  })

  it('returns an empty string when output only repeats prior assistant text', () => {
    expect(
      extractAntigravityPrintDelta({
        stdout: 'Already known',
        previousAssistantTexts: ['Already known'],
      }),
    ).toBe('')
  })

  it('leaves fresh one-shot output intact', () => {
    expect(
      extractAntigravityPrintDelta({
        stdout: '\nFresh answer\n',
        previousAssistantTexts: [],
      }),
    ).toBe('Fresh answer')
  })
})
