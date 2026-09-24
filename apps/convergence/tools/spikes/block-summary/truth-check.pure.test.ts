import { describe, expect, it } from 'vitest'
import { truthCheck } from './truth-check.pure'
import fixtures from './fixtures.json'

const block = {
  truth: {
    paths: [
      'src/widgets/session-view',
      'src/widgets/session-view/state.ts',
      'state.ts',
    ],
    toolNames: ['Read'],
  },
}
describe('block summary lexical truth gate', () => {
  it('accepts one supported sentence with a dotted path', () => {
    expect(
      truthCheck('Read src/widgets/session-view/state.ts.', block).pass,
    ).toBe(true)
  })
  it('rejects an invented path', () => {
    expect(truthCheck('Read src/auth/secrets.ts.', block).pass).toBe(false)
  })
  it('rejects an invented bare folder', () => {
    expect(truthCheck('Read the banana folder.', block).pass).toBe(false)
    expect(truthCheck('Read a folder named banana.', block).pass).toBe(false)
  })
  it('accepts trailing directory slashes and generic working-directory prose', () => {
    expect(
      truthCheck('Read the `src/widgets/session-view/` directory.', block).pass,
    ).toBe(true)
    expect(
      truthCheck('Read state.ts from the current working directory.', block)
        .pass,
    ).toBe(true)
  })
  it('rejects two sentences even with a valid dotted path', () => {
    expect(truthCheck('Read state.ts. Updated it.', block).pass).toBe(false)
    expect(
      truthCheck('Read src/widgets/session-view/state.ts. Updated it.', block)
        .pass,
    ).toBe(false)
  })
  it('pins the fourteen word boundary', () => {
    expect(truthCheck(Array(14).fill('word').join(' '), block).pass).toBe(true)
    expect(truthCheck(Array(15).fill('word').join(' '), block).pass).toBe(false)
  })
  it('rejects empty and multiline answers', () => {
    expect(truthCheck('', block).pass).toBe(false)
    expect(truthCheck('Read files\nUpdated files', block).pass).toBe(false)
  })
  it('does not mistake this lexical gate for outcome verification', () => {
    expect(truthCheck('All tests passed.', block).pass).toBe(true)
  })
  it('pins twenty synthetic blocks across four provider shapes', () => {
    expect(fixtures).toHaveLength(20)
    expect(new Set(fixtures.map((block) => block.provider)).size).toBe(4)
    expect(
      fixtures.filter((block) => block.label.startsWith('Trap:')),
    ).toHaveLength(2)
  })
})
