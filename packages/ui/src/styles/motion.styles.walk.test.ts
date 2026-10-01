import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'

/**
 * MAR-3319, for the design system's own source. No plugin motion token
 * survives in any non-test file of `@convergence/ui`.
 *
 * The app's walk (`apps/convergence/src/shared/ui/motion.styles.walk.test.ts`)
 * guards the app's tree; since the primitives moved here (MAR-3610) this one
 * guards theirs. The tree is the package's own few dozen files, so it needs no
 * walk budget.
 */
const sourceRoot = resolve(__dirname, '..')
const pluginTokens =
  /animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-from-|slide-out-to-/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && !/\.(test|spec)\.[^.]+$/.test(entry.name)
      ? [path]
      : []
  })
}

it('no plugin motion token survives in any non-test source file', () => {
  const files = sourceFiles(sourceRoot)
  expect(files).toContain(join(sourceRoot, 'components/tooltip/tooltip.tsx'))
  expect(
    files
      .filter((path) => pluginTokens.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(sourceRoot.length + 1)),
  ).toEqual([])
})
