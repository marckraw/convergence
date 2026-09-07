import { expect, it } from 'vitest'
import { extractReleaseNotes } from './extract-release-notes.mjs'

it.each([
  [
    'first release at EOF',
    '# backpack-studio\n\n## 0.1.0\n\n### Minor Changes\n\n- First release\n',
  ],
  [
    'before older release',
    '# backpack-studio\n\n## 0.1.0\n\n### Minor Changes\n\n- First release\n\n## 0.0.0\nOld notes\n',
  ],
])('%s — mutation: discard the requested section', (_, changelog) => {
  expect(extractReleaseNotes(changelog, '0.1.0')).toBe(
    '### Minor Changes\n\n- First release\n',
  )
})
it('missing version fails closed — mutation: use the whole changelog', () => {
  expect(() => extractReleaseNotes('## 0.1.0\nFirst', '0.2.0')).toThrow(
    'No release notes for 0.2.0',
  )
})
