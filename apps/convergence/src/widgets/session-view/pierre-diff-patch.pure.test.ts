import { describe, expect, it } from 'vitest'
import { buildPierrePatch, pierreDiffPatchView } from './pierre-diff-patch.pure'
import { buildLargePierreDiffFixture } from './pierre-diff-performance.pure'

/** A hunk with ten lines of context above and below its one change. */
const hunk = [
  '@@ -1,21 +1,21 @@',
  ...Array.from({ length: 10 }, (_, index) => ` above ${index + 1}`),
  '-old',
  '+new',
  ...Array.from({ length: 10 }, (_, index) => ` below ${index + 1}`),
].join('\n')

describe('buildPierrePatch (CONV-30)', () => {
  it('adds the file header a bare hunk lacks', () => {
    expect(
      buildPierrePatch({ file: 'src/app.ts', diff: '@@ -1 +1 @@\n-a\n+b\n' }),
    ).toBe(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -1 +1 @@',
        '-a',
        '+b',
      ].join('\n'),
    )
  })

  it('keeps a patch that has git’s own header', () => {
    const patch = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b'
    expect(buildPierrePatch({ file: 'x', diff: patch })).toBe(patch)
  })

  it('is null for a diff with no hunks, such as a binary file', () => {
    expect(
      buildPierrePatch({ file: 'icon.icns', diff: 'Binary files differ' }),
    ).toBeNull()
    expect(buildPierrePatch({ file: 'x', diff: '' })).toBeNull()
  })
})

describe('pierreDiffPatchView (CONV-30)', () => {
  it('folds the context to three lines and offers the controls', () => {
    const view = pierreDiffPatchView({
      file: 'src/app.ts',
      diff: hunk,
      contextBefore: 3,
      contextAfter: 3,
    })
    expect(view.patch).toContain('-old')
    expect(view.patch).not.toContain(' above 1\n')
    expect(view.folded?.totalHidden).toBe(14)
    expect(view.expandedFromDefault).toBe(false)
    expect(view.showContextControls).toBe(true)
  })

  it('says the context is widened, so Reset has work', () => {
    const view = pierreDiffPatchView({
      file: 'src/app.ts',
      diff: hunk,
      contextBefore: 23,
      contextAfter: 23,
    })
    expect(view.folded?.totalHidden).toBe(0)
    expect(view.expandedFromDefault).toBe(true)
    expect(view.showContextControls).toBe(true)
  })

  it('has no patch and no controls without a file, or for a binary diff', () => {
    for (const view of [
      pierreDiffPatchView({
        file: null,
        diff: hunk,
        contextBefore: 3,
        contextAfter: 3,
      }),
      pierreDiffPatchView({
        file: 'icon.icns',
        diff: 'Binary files differ',
        contextBefore: 3,
        contextAfter: 3,
      }),
    ]) {
      expect(view.patch).toBeNull()
      expect(view.folded).toBeNull()
      expect(view.showContextControls).toBe(false)
    }
  })

  it('plans the drawing from the folded patch: a big one is virtualised', () => {
    const view = pierreDiffPatchView({
      file: 'big.ts',
      diff: buildLargePierreDiffFixture(1200),
      contextBefore: 3,
      contextAfter: 3,
    })
    expect(view.performance.virtualize).toBe(true)
    expect(view.performance.useWorkerPool).toBe(true)
  })
})
