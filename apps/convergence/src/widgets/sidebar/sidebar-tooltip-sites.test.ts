import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WALK_TEST_TIMEOUT_MS } from '../../../test/walk-budget'

/**
 * The sidebar's hover hints use the shared Tooltip (MAR-3314 R2).
 *
 * A native `title=` hint waits a second, ignores the theme, and cannot be
 * styled — so a control wearing both whispers twice. The pin is the absence
 * of those hints on the page's own elements (except a clamped truncation
 * line, or the literal empty `title=""` ProviderIcon prop that is not a
 * hint). A part's `title` prop is its words, not a hint: ListRow's and
 * EmptyState's are what the row or the box says (MAR-3617), so only a
 * lowercase element's `title=` counts. A tooltip that floats over the title
 * strip must be `no-drag` (MAR-3284); since MAR-3616 the one tooltip host is,
 * so the pin is that no sidebar file builds a tooltip of its own again.
 */
const SIDEBAR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))

const NATIVE_HINT = /\btitle=/g
const EMPTY_TITLE = /\btitle=""/
const TRUNCATION_COMMENT = '// truncation hint (MAR-3314)'

/**
 * The JSX tag a `title=` at `index` belongs to: the nearest `<Name` before it
 * at the same brace depth, so an element handed to a prop on the way
 * (`render={<button />}`) is stepped over.
 */
function tagBefore(source: string, index: number): string | null {
  let depth = 0
  for (let at = index - 1; at >= 0; at--) {
    const char = source[at]
    if (char === '}') depth++
    else if (char === '{') depth--
    else if (char === '<' && depth === 0) {
      const tag = /^<([A-Za-z][\w.]*)/.exec(source.slice(at))
      if (tag) return tag[1]
    }
  }
  return null
}

/** Each `title=` on a page element (a lowercase tag), by line. */
function nativeHints(source: string) {
  const lines = source.split('\n')
  return [...source.matchAll(NATIVE_HINT)]
    .filter((match) => /^[a-z]/.test(tagBefore(source, match.index) ?? ''))
    .map((match) => {
      const index = source.slice(0, match.index).split('\n').length
      return { line: lines[index - 1], index }
    })
}

const OWN_TOOLTIP = /<TooltipContent\b/

function sidebarTsxFiles(): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(path)
        continue
      }
      if (!entry.name.endsWith('.tsx')) continue
      if (entry.name.includes('.test.')) continue
      files.push(path)
    }
  }
  walk(SIDEBAR_ROOT)
  return files.sort()
}

const SIDEBAR_FILES = sidebarTsxFiles()

describe('MAR-3314 R2: the sidebar cannot grow an OS hint again', () => {
  it.each(
    SIDEBAR_FILES.map((path) => [path.slice(SIDEBAR_ROOT.length + 1), path]),
  )(
    '%s hands no hint to the OS (except truncation or empty title="")',
    { timeout: WALK_TEST_TIMEOUT_MS },
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      const offenders = nativeHints(source)
        .filter(({ line }) => !line.includes(TRUNCATION_COMMENT))
        .filter(({ line }) => !EMPTY_TITLE.test(line))
      // Mutation: add a title= hint to any sidebar file -> red.
      expect(offenders).toEqual([])
    },
  )
})

describe('MAR-3314 R2: every sidebar tooltip is the no-drag host', () => {
  it.each(
    SIDEBAR_FILES.map((path) => [path.slice(SIDEBAR_ROOT.length + 1), path]),
  )(
    '%s builds no tooltip of its own',
    { timeout: WALK_TEST_TIMEOUT_MS },
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      // Mutation: bring back a per-instance `TooltipContent` in any sidebar
      // file -> red.
      expect(source).not.toMatch(OWN_TOOLTIP)
    },
  )
})
