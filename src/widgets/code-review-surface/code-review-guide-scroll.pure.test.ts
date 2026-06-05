import { describe, expect, it } from 'vitest'
import {
  buildCodeReviewGuideFileAnchorKey,
  selectActiveCodeReviewGuideSection,
} from './code-review-guide-scroll.pure'

describe('code review guide scroll helpers', () => {
  it('selects the section containing the activation line', () => {
    expect(
      selectActiveCodeReviewGuideSection({
        sections: [
          { id: 'setup', top: 0, bottom: 420 },
          { id: 'runtime', top: 420, bottom: 900 },
        ],
        viewportTop: 280,
        viewportBottom: 880,
        activationOffset: 96,
      }),
    ).toBe('setup')
  })

  it('hands off to the next section after the previous section bottom passes', () => {
    expect(
      selectActiveCodeReviewGuideSection({
        sections: [
          { id: 'setup', top: -480, bottom: 40 },
          { id: 'runtime', top: 40, bottom: 640 },
        ],
        viewportTop: 0,
        viewportBottom: 600,
        activationOffset: 96,
      }),
    ).toBe('runtime')
  })

  it('falls back to the first visible section before the activation line reaches it', () => {
    expect(
      selectActiveCodeReviewGuideSection({
        sections: [
          { id: 'setup', top: 180, bottom: 520 },
          { id: 'runtime', top: 520, bottom: 900 },
        ],
        viewportTop: 0,
        viewportBottom: 600,
        activationOffset: 96,
      }),
    ).toBe('setup')
  })

  it('uses section-aware file anchor keys for repeated file paths', () => {
    expect(
      buildCodeReviewGuideFileAnchorKey({
        sectionId: 'setup',
        filePath: 'src/app.ts',
      }),
    ).not.toBe(
      buildCodeReviewGuideFileAnchorKey({
        sectionId: 'runtime',
        filePath: 'src/app.ts',
      }),
    )
  })
})
