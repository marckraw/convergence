import { describe, expect, it } from 'vitest'
import { resolveReleaseTag } from './resolve-release-tag.mjs'

describe('independent app releases', () => {
  it.each([
    ['Convergence only', '1.1.0', '1.0.0', '0.1.0', '0.1.0', ['v1.1.0']],
    ['Studio only', '1.0.0', '1.0.0', '0.2.0', '0.1.0', ['studio-v0.2.0']],
    ['both', '1.1.0', '1.0.0', '0.2.0', '0.1.0', ['v1.1.0', 'studio-v0.2.0']],
    ['neither', '1.0.0', '1.0.0', '0.1.0', '0.1.0', []],
  ])(
    '%s — mutation: ignore one app or its version guard',
    (_, cv, cp, sv, sp, expected) => {
      const states = [
        resolveReleaseTag(cv, cp, 'v', []),
        resolveReleaseTag(sv, sp, 'studio-v', []),
      ]
      expect(
        states
          .filter((s) => s.version_changed && !s.tag_exists)
          .map((s) => s.tag),
      ).toEqual(expected)
    },
  )
  it('existing tag — mutation: discard existing tags', () => {
    expect(
      resolveReleaseTag('0.2.0', '0.1.0', 'studio-v', ['studio-v0.2.0']),
    ).toEqual({
      version: '0.2.0',
      tag: 'studio-v0.2.0',
      version_changed: true,
      tag_exists: true,
    })
  })
  it('new manifest — mutation: treat absent parent as unchanged', () => {
    expect(
      resolveReleaseTag('0.1.0', undefined, 'studio-v', []).version_changed,
    ).toBe(true)
  })
})
