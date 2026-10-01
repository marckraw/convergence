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
 * of those hints (except a clamped truncation line, or the literal empty
 * `title=""` ProviderIcon prop that is not a hint). A tooltip that floats
 * over the title strip must be `no-drag` (MAR-3284); since MAR-3616 the one
 * tooltip host is, so the pin is that no sidebar file builds a tooltip of its
 * own again.
 */
const SIDEBAR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))

const NATIVE_HINT = /\btitle=/
const EMPTY_TITLE = /\btitle=""/
const TRUNCATION_COMMENT = '// truncation hint (MAR-3314)'

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
      const offenders = source
        .split('\n')
        .map((line, index) => ({ line, index: index + 1 }))
        .filter(({ line }) => NATIVE_HINT.test(line))
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
