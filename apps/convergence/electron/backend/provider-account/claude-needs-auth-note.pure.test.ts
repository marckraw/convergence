import { describe, expect, it } from 'vitest'
import { pruneClaudeNeedsAuthNote } from './claude-needs-auth-note.pure'

const note = JSON.stringify({
  sentry: { timestamp: 1 },
  'plugin:figma:figma': { timestamp: 2 },
  'claude.ai Figma': { timestamp: 3, id: 'mcpsrv_x' },
})

describe('MAR-3517 a "needs sign-in" note for a Connected server is removed', () => {
  it('removes only the entries of servers reported Connected, keeping the rest as they were', () => {
    const pruned = pruneClaudeNeedsAuthNote(note, ['claude.ai Figma', 'linear'])
    expect(pruned?.cleared).toEqual(['claude.ai Figma'])
    expect(JSON.parse(pruned!.next)).toEqual({
      sentry: { timestamp: 1 },
      'plugin:figma:figma': { timestamp: 2 },
    })
  })
  it('names a server once, however often it was reported', () => {
    expect(
      pruneClaudeNeedsAuthNote(note, ['claude.ai Figma', 'claude.ai Figma'])
        ?.cleared,
    ).toEqual(['claude.ai Figma'])
  })
  it('writes nothing when no entry belongs to a Connected server', () => {
    expect(pruneClaudeNeedsAuthNote(note, ['linear'])).toBeNull()
    expect(pruneClaudeNeedsAuthNote(note, [])).toBeNull()
  })
  it('never rewrites a note it cannot read', () => {
    expect(pruneClaudeNeedsAuthNote('{not json', ['sentry'])).toBeNull()
    expect(pruneClaudeNeedsAuthNote('null', ['sentry'])).toBeNull()
    // An array has own index keys, so '0' would match without the array check.
    expect(pruneClaudeNeedsAuthNote('["claude.ai Figma"]', ['0'])).toBeNull()
    expect(pruneClaudeNeedsAuthNote('"sentry"', ['sentry'])).toBeNull()
  })
  it('an inherited name is not an entry', () => {
    expect(pruneClaudeNeedsAuthNote('{}', ['toString'])).toBeNull()
  })
})
