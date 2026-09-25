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
 * `title=""` ProviderIcon prop that is not a hint). And every
 * `TooltipContent` that can float over the title strip must declare
 * `LOOM_NO_DRAG_STYLE` (MAR-3284): a rendered hover only opens one portal,
 * so count equality is how the rest stay honest.
 */
const SIDEBAR_ROOT = resolve(dirname(fileURLToPath(import.meta.url)))

const NATIVE_HINT = /\btitle=/
const EMPTY_TITLE = /\btitle=""/
const TRUNCATION_COMMENT = '// truncation hint (MAR-3314)'

const TOOLTIP_CONTENT = /<TooltipContent\b/g
// Opening tag to its `>`: `[\s\S]` crosses newlines so a broken tag is one.
const TOOLTIP_CONTENT_TAG = /<TooltipContent\b[\s\S]*?>/g
const NO_DRAG = 'style={LOOM_NO_DRAG_STYLE}'

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

describe('MAR-3314 R2: every sidebar tooltip is no-drag, not just the read one', () => {
  const withTooltips = SIDEBAR_FILES.filter((path) =>
    /<TooltipContent\b/.test(readFileSync(path, 'utf8')),
  )

  it.each(
    withTooltips.map((path) => [path.slice(SIDEBAR_ROOT.length + 1), path]),
  )(
    '%s gives every tooltip the no-drag style',
    { timeout: WALK_TEST_TIMEOUT_MS },
    (_name, path) => {
      const source = readFileSync(path, 'utf8')
      const written = source.match(TOOLTIP_CONTENT) ?? []
      const noDrag = (source.match(TOOLTIP_CONTENT_TAG) ?? []).filter((tag) =>
        tag.includes(NO_DRAG),
      )
      // Mutation: drop the style from ANY one TooltipContent -> red here.
      expect(written.length).toBeGreaterThan(0)
      expect(noDrag.length).toBe(written.length)
    },
  )
})
