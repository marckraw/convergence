import { describe, expect, it } from 'vitest'
import { foldUnifiedDiffContext } from './diff-context.pure'

describe('foldUnifiedDiffContext', () => {
  it('returns patches without hunks unchanged', () => {
    const patch = 'Binary files a/logo.png and b/logo.png differ'

    expect(
      foldUnifiedDiffContext(patch, { before: 3, after: 3 }),
    ).toMatchObject({
      patch,
      totalHidden: 0,
      canExpandBefore: false,
      canExpandAfter: false,
    })
  })

  it('keeps compact patches unchanged when no context can be hidden', () => {
    const patch = ['@@ -1,3 +1,3 @@', ' one', '-old', '+new', ' three'].join(
      '\n',
    )

    expect(foldUnifiedDiffContext(patch, { before: 3, after: 3 }).patch).toBe(
      patch,
    )
  })

  it('folds excess context around a single changed block', () => {
    const patch = [
      'diff --git a/src/app.ts b/src/app.ts',
      '--- a/src/app.ts',
      '+++ b/src/app.ts',
      '@@ -1,10 +1,10 @@ export function run()',
      ' one',
      ' two',
      ' three',
      ' four',
      '-old',
      '+new',
      ' six',
      ' seven',
      ' eight',
      ' nine',
    ].join('\n')

    const folded = foldUnifiedDiffContext(patch, { before: 2, after: 2 })

    expect(folded).toMatchObject({
      hiddenBefore: 2,
      hiddenAfter: 2,
      canExpandBefore: true,
      canExpandAfter: true,
    })
    expect(folded.patch).toBe(
      [
        'diff --git a/src/app.ts b/src/app.ts',
        '--- a/src/app.ts',
        '+++ b/src/app.ts',
        '@@ -3,5 +3,5 @@ export function run()',
        ' three',
        ' four',
        '-old',
        '+new',
        ' six',
        ' seven',
      ].join('\n'),
    )
  })

  it('splits one rich hunk into valid visible hunk ranges', () => {
    const patch = [
      '@@ -1,13 +1,13 @@',
      ' one',
      ' two',
      '-old a',
      '+new a',
      ' five',
      ' six',
      ' seven',
      ' eight',
      ' nine',
      '-old b',
      '+new b',
      ' twelve',
      ' thirteen',
    ].join('\n')

    const folded = foldUnifiedDiffContext(patch, { before: 1, after: 1 })

    expect(folded.patch).toBe(
      [
        '@@ -2,3 +2,3 @@',
        ' two',
        '-old a',
        '+new a',
        ' five',
        '@@ -8,3 +8,3 @@',
        ' nine',
        '-old b',
        '+new b',
        ' twelve',
      ].join('\n'),
    )
  })

  it('reveals more stored context when the requested window grows', () => {
    const patch = [
      '@@ -1,8 +1,8 @@',
      ' one',
      ' two',
      ' three',
      '-old',
      '+new',
      ' six',
      ' seven',
      ' eight',
    ].join('\n')

    const compact = foldUnifiedDiffContext(patch, { before: 1, after: 1 })
    const expanded = foldUnifiedDiffContext(patch, { before: 3, after: 3 })

    expect(compact.patch).not.toContain(' one')
    expect(compact.patch).not.toContain(' eight')
    expect(expanded.patch).toContain(' one')
    expect(expanded.patch).toContain(' eight')
    expect(expanded.totalHidden).toBe(0)
  })
})
