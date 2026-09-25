import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * MAR-3319. No plugin motion token survives in any non-test source file.
 *
 * The walk used to share `motion.styles.test.ts` with the rendered surface
 * tests, so a busy machine timed the whole file out on the read (MAR-3385).
 * The assertion is unchanged. The rendered suite still matches this same
 * token pattern on the elements it mounts.
 */
const sourceRoot = resolve(__dirname, '../..')
const pluginTokens =
  /animate-in|animate-out|fade-in-|fade-out-|zoom-in-|zoom-out-|slide-in-from-|slide-out-to-/

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.name.startsWith('.env')) return []
    if (entry.isDirectory()) return sourceFiles(path)
    return entry.isFile() && !/\.(test|spec)\.[^.]+$/.test(entry.name)
      ? [path]
      : []
  })
}

it(
  'no plugin motion token survives in any non-test source file',
  { timeout: WALK_TEST_TIMEOUT_MS },
  () => {
    const files = sourceFiles(sourceRoot)
    expect(files.length).toBeGreaterThan(100)
    expect(files).toContain(join(__dirname, 'tooltip.tsx'))
    expect(
      files
        .filter((path) => pluginTokens.test(readFileSync(path, 'utf8')))
        .map((path) => path.slice(sourceRoot.length + 1)),
    ).toEqual([])
  },
)
