import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { globSync } from 'node:fs'

/**
 * Streamdown's components carry their Tailwind classes inside its bundle, and
 * Tailwind only emits a class it has scanned. The `@source` globs in
 * `global.css` are paths relative to that file, and a path into a
 * `node_modules` that does not exist scans nothing and fails silently: after
 * the monorepo move hoisted the packages to the root, the code block's
 * `pointer-events-auto` and `-mt-10` stopped being emitted, its copy/download
 * buttons inherited `pointer-events: none` from their rail, and nothing was
 * red (MAR-2760). This test reads the globs the stylesheet declares and
 * checks each one against where the package is actually installed.
 */
const GLOBAL_CSS_PATH = resolve(__dirname, 'global.css')
const SCANNED_PACKAGES = [
  'streamdown',
  '@streamdown/mermaid',
  '@streamdown/code',
]

function declaredSourceGlobs(): string[] {
  const css = readFileSync(GLOBAL_CSS_PATH, 'utf8')
  return [...css.matchAll(/@source\s+"([^"]+)"/g)].map((match) =>
    resolve(dirname(GLOBAL_CSS_PATH), match[1]),
  )
}

/**
 * Where the package really lives: the nearest `node_modules` up the tree from
 * the stylesheet that holds it — the same walk the bundler makes. Hoisting
 * decides which directory that is, and hoisting is exactly what moved the
 * packages out from under the old globs.
 */
function installedDistGlob(packageName: string): string {
  let directory = dirname(GLOBAL_CSS_PATH)
  for (;;) {
    const candidate = resolve(directory, 'node_modules', packageName)
    if (existsSync(resolve(candidate, 'package.json'))) {
      return resolve(candidate, 'dist/*.js')
    }
    const parent = dirname(directory)
    if (parent === directory) {
      throw new Error(
        `${packageName} is not installed above ${GLOBAL_CSS_PATH}`,
      )
    }
    directory = parent
  }
}

describe('global.css @source globs', () => {
  const globs = declaredSourceGlobs()

  it.each(SCANNED_PACKAGES)(
    'scans the bundle of %s where it is actually installed',
    (packageName) => {
      const expected = installedDistGlob(packageName)
      expect(globs).toContain(expected)
      expect(existsSync(dirname(expected))).toBe(true)
    },
  )

  it('every declared glob matches at least one file', () => {
    for (const pattern of globs) {
      const matches = globSync(pattern)
      expect(matches.length, `${pattern} matched nothing`).toBeGreaterThan(0)
    }
  })
})
